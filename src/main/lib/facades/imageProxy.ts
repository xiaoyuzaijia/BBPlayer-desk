// 本地 HTTP server 代理 B 站图片
// 解决渲染进程 <img> 标签无法设 Referer 导致 B 站 CDN 403 防盗链问题
// 渲染进程 <img src="http://127.0.0.1:<port>/image?url=<encoded>">
// 主进程 fetch 原 URL 时带 Referer/UA，转发响应 body + content-type
import { createServer, type Server } from 'node:http'

import log from '../utils/log'

const logger = log.extend('ImageProxy')

const BILIBILI_CDN_HOSTS = /^i[0-2]\.hdslb\.com$/

const REQUEST_HEADERS = {
  Referer: 'https://www.bilibili.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
}

let server: Server | null = null
let port: number | null = null

/**
 * 启动本地图片代理 server
 * 监听 127.0.0.1，系统自动分配端口（避免端口冲突）
 * 返回端口号，渲染进程用 http://127.0.0.1:<port>/image?url=... 访问
 */
export function startImageProxy(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server && port !== null) {
      resolve(port)
      return
    }

    server = createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith('/image?')) {
          res.statusCode = 404
          res.end('Not Found')
          return
        }

        // 解析 url 查询参数
        const urlObj = new URL(req.url, 'http://127.0.0.1')
        const targetUrl = urlObj.searchParams.get('url')
        if (!targetUrl) {
          res.statusCode = 400
          res.end('Missing url param')
          return
        }

        // 安全校验：只允许 B 站 CDN 图片
        const parsed = new URL(targetUrl)
        if (!BILIBILI_CDN_HOSTS.test(parsed.hostname)) {
          res.statusCode = 403
          res.end('Host not allowed')
          return
        }

        // 转发请求到 B 站 CDN，带 Referer/UA 绕过防盗链
        const upstream = await fetch(targetUrl, {
          headers: REQUEST_HEADERS,
        })

        if (!upstream.ok) {
          res.statusCode = upstream.status
          res.end(`Upstream error: ${upstream.status}`)
          return
        }

        // 转发 content-type + body
        const contentType = upstream.headers.get('content-type')
        if (contentType) {
          res.setHeader('Content-Type', contentType)
        }
        const cacheControl = upstream.headers.get('cache-control')
        if (cacheControl) {
          res.setHeader('Cache-Control', cacheControl)
        }
        // 缓存 1 天（B 站头像 URL 带版本 hash，可放心缓存）
        if (!cacheControl) {
          res.setHeader('Cache-Control', 'public, max-age=86400')
        }

        const body = await upstream.arrayBuffer()
        res.end(Buffer.from(body))
      } catch (error) {
        logger.error('代理请求失败:', error)
        res.statusCode = 500
        res.end('Proxy error')
      }
    })

    server.on('error', (error) => {
      logger.error('server 错误:', error)
      reject(error)
    })

    // 监听 127.0.0.1 + 端口 0（系统分配）
    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address()
      if (addr && typeof addr === 'object') {
        port = addr.port
        logger.info(`图片代理 server 启动：http://127.0.0.1:${port}`)
        resolve(port)
      } else {
        reject(new Error('无法获取端口'))
      }
    })
  })
}

/**
 * 停止图片代理 server
 */
export function stopImageProxy(): void {
  if (server) {
    server.close()
    server = null
    port = null
  }
}
