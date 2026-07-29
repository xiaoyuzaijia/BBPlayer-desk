// 本地 HTTP server 代理 B 站音频流
// 解决渲染进程 <audio> 无法带 Referer/cookie 导致 B 站 CDN 403 防盗链问题
// 渲染进程 <audio src="http://127.0.0.1:<port>/stream?url=<encoded>">
//
// 与 imageProxy 的关键差异：
// - host 白名单更宽松（B 站音频流 CDN host 分散：bilivideo.com / bilivideo.cn / akamaized.net）
// - 必须支持 Range 请求（拖动进度条）：透传 Range 请求头 + 206 Partial Content + Content-Range
// - 不缓存 body（流式转发，避免大文件占内存）
// - SSRF 防护：拒绝私有 IP / localhost / link-local
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'

import log from '../utils/log'

const logger = log.extend('StreamProxy')

// B 站音频流 CDN host 白名单（baseUrl/backupUrl 用的域名）
// 涵盖主流 cn / com 后缀与 akamai CDN
const ALLOWED_HOST_SUFFIXES = [
  '.bilivideo.com',
  '.bilivideo.cn',
  '.akamaized.net',
  '.bilivideo.com.',
  '.bilivideo.cn.',
]

// 注入到上游请求的请求头（伪装 B 站 web 端）
const REQUEST_HEADERS = {
  Referer: 'https://www.bilibili.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Origin: 'https://www.bilibili.com',
} as const

let server: Server | null = null
let port: number | null = null

/**
 * 校验 targetUrl 是否安全：
 * 1. 必须是 https
 * 2. host 在白名单后缀内
 * 3. 解析出的 IP 不是私有 / loopback / link-local（防 SSRF）
 */
function isUrlSafe(targetUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  const matches = ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) || host === suffix.slice(1, -1),
  )
  if (!matches) return false
  // 简单 IPv4 私有段检查（host 为 IP 时）
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.').map(Number)
    if (parts[0] === 10) return false
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false
    if (parts[0] === 192 && parts[1] === 168) return false
    if (parts[0] === 127) return false // loopback
    if (parts[0] === 169 && parts[1] === 254) return false // link-local
  }
  return true
}

/**
 * 把上游响应的 headers 透传给客户端（白名单方式）
 * - Content-Type / Content-Length / Content-Range / Accept-Ranges 必须透传
 * - Cache-Control 不透传（音频流 URL 有时效，不应被中间层缓存）
 */
function pipeResponseHeaders(
  res: ServerResponse,
  upstream: Response,
): void {
  const passthrough = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
  ]
  for (const name of passthrough) {
    const v = upstream.headers.get(name)
    if (v) res.setHeader(name, v)
  }
}

/**
 * 处理单个 stream 代理请求
 */
async function handleStreamRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url?.startsWith('/stream?')) {
    res.statusCode = 404
    res.end('Not Found')
    return
  }

  const urlObj = new URL(req.url, 'http://127.0.0.1')
  const targetUrl = urlObj.searchParams.get('url')
  if (!targetUrl) {
    res.statusCode = 400
    res.end('Missing url param')
    return
  }

  if (!isUrlSafe(targetUrl)) {
    logger.warning(`拒绝不安全的 url: ${targetUrl}`)
    res.statusCode = 403
    res.end('URL not allowed')
    return
  }

  // 构造上游请求头：基础伪装头 + 透传客户端 Range（用于拖动进度条）
  const upstreamHeaders: Record<string, string> = {
    ...REQUEST_HEADERS,
  }
  if (req.headers.range) {
    upstreamHeaders.Range = req.headers.range
  }

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, { headers: upstreamHeaders })
  } catch (error) {
    logger.error('上游请求失败:', error)
    res.statusCode = 502
    res.end('Upstream fetch failed')
    return
  }

  if (!upstream.ok && upstream.status !== 206) {
    res.statusCode = upstream.status
    res.end(`Upstream error: ${upstream.status}`)
    return
  }

  // 透传状态码（200 或 206）+ 关键响应头
  res.statusCode = upstream.status
  pipeResponseHeaders(res, upstream)

  // 流式转发 body，避免大音频占内存
  // upstream.body 是 ReadableStream（undici 实现），用 getReader 逐块读
  const reader = upstream.body?.getReader()
  if (!reader) {
    res.end()
    return
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!res.write(value)) {
        // backpressure：等 drain
        await new Promise<void>((resolve) => res.once('drain', () => resolve()))
      }
    }
    res.end()
  } catch (error) {
    logger.error('流式转发失败:', error)
    // 连接可能已部分写入，仅尝试结束
    res.destroy()
  }
}

/**
 * 启动本地音频流代理 server
 * 监听 127.0.0.1，系统自动分配端口（避免端口冲突）
 * 返回端口号，渲染进程用 http://127.0.0.1:<port>/stream?url=... 访问
 */
export function startStreamProxy(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server && port !== null) {
      resolve(port)
      return
    }

    server = createServer((req, res) => {
      handleStreamRequest(req, res).catch((error) => {
        logger.error('未捕获的代理错误:', error)
        if (!res.headersSent) {
          res.statusCode = 500
          res.end('Proxy error')
        } else {
          res.destroy()
        }
      })
    })

    server.on('error', (error) => {
      logger.error('server 错误:', error)
      reject(error)
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address()
      if (addr && typeof addr === 'object') {
        port = addr.port
        logger.info(`音频流代理 server 启动：http://127.0.0.1:${port}`)
        resolve(port)
      } else {
        reject(new Error('无法获取端口'))
      }
    })
  })
}

/**
 * 停止音频流代理 server
 */
export function stopStreamProxy(): void {
  if (server) {
    server.close()
    server = null
    port = null
  }
}

/**
 * 获取当前代理端口（启动后才有值，未启动返回 null）
 */
export function getStreamProxyPort(): number | null {
  return port
}
