// B 站图片 URL 处理工具
// 参考 BBPlayer apps/mobile/src/utils/imageUrl.ts
//
// Electron 渲染进程 <img> 标签无法设 Referer，B 站 CDN 防盗链会 403
// 解决方案：B 站 CDN 图片走主进程本地代理 server（127.0.0.1:<port>/image?url=...）
// 主进程 fetch 时带 Referer/UA 绕过防盗链
//
// 端口策略：端口由系统分配（避免冲突），渲染进程首次调用时通过 IPC 获取并缓存

const BILIBILI_IMAGE_CDN = /^https?:\/\/i[0-2]\.hdslb\.com\/bfs\//

let cachedProxyPort: number | null = null
let portPromise: Promise<number> | null = null

/**
 * 获取本地图片代理 server 端口（带缓存）
 * 多次调用只发一次 IPC，后续直接返回缓存值
 */
async function getProxyPort(): Promise<number> {
  if (cachedProxyPort !== null) return cachedProxyPort
  if (portPromise) return portPromise
  portPromise = window.api.image.getProxyPort()
  cachedProxyPort = await portPromise
  portPromise = null
  return cachedProxyPort
}

/**
 * 把 B 站图片 URL 转为代理 URL
 * - B 站 CDN 图片：走本地代理 http://127.0.0.1:<port>/image?url=<encoded>
 * - 非 B 站图片：只做 http→https 转换
 *
 * 注意：这是 async 函数（需要先拿端口）。
 * 组件中用 watchEffect + ref 处理，或用 vue-query 包装。
 */
export async function resolveBilibiliImageUrl(
  url: string | null | undefined,
  _maxSize = 200,
): Promise<string | null | undefined> {
  if (!url) return url
  const secureUrl = url.startsWith('http:')
    ? url.replace('http:', 'https:')
    : url
  if (!BILIBILI_IMAGE_CDN.test(secureUrl)) return secureUrl
  const port = await getProxyPort()
  return `http://127.0.0.1:${port}/image?url=${encodeURIComponent(secureUrl)}`
}
