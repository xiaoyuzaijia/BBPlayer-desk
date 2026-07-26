// Cookie 解析/序列化纯函数（从 BBPlayer useAppStore.ts 提取）
// 用 cookie 包 v2 的 parseCookie / stringifySetCookie API
// 删除 toast.error 调用（主进程不弹 toast）
import * as parseCookie from 'cookie'
import { err, ok, type Result } from 'neverthrow'

/**
 * 解析 cookie 字符串为对象
 * 自动 trim key/value，剔除空 key
 */
export const parseCookieToObject = (
  cookie?: string,
): Result<Record<string, string>, Error> => {
  if (!cookie?.trim()) {
    return ok({})
  }
  try {
    const cookieObj = parseCookie.parseCookie(cookie)
    const sanitizedObj: Record<string, string> = {}

    for (const [key, value] of Object.entries(cookieObj)) {
      if (value === undefined) {
        return err(
          new Error(`无效的 cookie 字符串：值为 undefined：${value}`),
        )
      }
      const trimmedKey = key.trim()
      const trimmedValue = (value as string).trim()

      if (!trimmedKey) {
        continue
      }

      sanitizedObj[trimmedKey] = trimmedValue
    }

    return ok(sanitizedObj)
  } catch (error) {
    return err(
      new Error(
        `无效的 cookie 字符串: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }
}

/**
 * 将 cookie 对象序列化为 Cookie 请求头格式字符串
 * 双层 try/catch：先按原值，失败用 trim 过的值重试
 */
export const serializeCookieObject = (
  cookieObj: Record<string, string>,
): string => {
  return Object.entries(cookieObj)
    .map(([key, value]) => {
      try {
        return parseCookie.stringifySetCookie({ name: key, value })
      } catch {
        try {
          return parseCookie.stringifySetCookie({
            name: key.trim(),
            value: value.trim(),
          })
        } catch {
          return null
        }
      }
    })
    .filter((item) => item !== null)
    .join('; ')
}
