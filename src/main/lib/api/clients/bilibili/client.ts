// B 站 API client（迁移自 BBPlayer apps/mobile/src/lib/api/bilibili/client.ts）
// 改动：
// - 删除 useAppStore / serializeCookieObject 依赖
// - 改用 appState 模块级单例 + appState.getBilibiliCookieHeader()
// - getCsrfToken 改为接受 cookieObj 参数
import { errAsync, okAsync, ResultAsync } from 'neverthrow'

import { BilibiliApiError } from '../../../errors/bilibili'
import { appState } from '../../../config/store'

import { getCsrfToken } from './utils'

export interface ReqResponse<T> {
  code: number
  message: string
  data: T
}

const toRequestError = (error: unknown) => {
  if (error instanceof Error && error.name === 'AbortError') {
    return new BilibiliApiError({
      message: '请求被取消',
      type: 'RequestAborted',
      cause: error,
    })
  }

  return new BilibiliApiError({
    message: `请求失败: ${error instanceof Error ? error.message : String(error)}`,
    type: 'RequestFailed',
    cause: error,
  })
}

class ApiClient {
  private baseUrl = 'https://api.bilibili.com'

  /**
   * 核心请求 method，使用 neverthrow 进行封装
   */
  private request = <T>({
    endpoint,
    options = {},
    fullUrl,
    skipCookie,
  }: {
    endpoint: string
    options?: RequestInit
    fullUrl?: string
    skipCookie?: boolean
  }): ResultAsync<T, BilibiliApiError> => {
    const url = fullUrl ?? `${this.baseUrl}${endpoint}`
    const cookie =
      !skipCookie && appState.hasBilibiliCookie()
        ? appState.getBilibiliCookieHeader()
        : ''

    const defaultHeaders = {
      Cookie: cookie,
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0',
      Referer: 'https://www.bilibili.com/',
      Origin: 'https://www.bilibili.com',
    }

    const headers = new Headers(defaultHeaders)

    if (options.headers) {
      new Headers(options.headers).forEach((value, key) => {
        headers.set(key, value)
      })
    }

    return ResultAsync.fromPromise(
      fetch(url, {
        ...options,
        headers,
        // Node fetch 不会自动注入 cookie，我们已手动管理
        credentials: 'omit',
      }),
      toRequestError,
    )
      .andThen((response) => {
        if (!response.ok) {
          return errAsync(
            new BilibiliApiError({
              message: `请求 bilibili API 失败: ${response.status} ${response.statusText}`,
              msgCode: response.status,
              type: 'RequestFailed',
            }),
          )
        }
        const data = response.json() as Promise<ReqResponse<T>>
        return ResultAsync.fromPromise(
          data,
          (error) =>
            new BilibiliApiError({
              message:
                error instanceof Error ? error.message : String(error),
              type: 'ResponseFailed',
            }),
        )
      })
      .andThen((data) => {
        // 对于 wbi 接口，直接返回 data，因为未登录状态下 code 为 -101
        if (endpoint === '/x/web-interface/nav') {
          return okAsync(data.data)
        }
        if (data.code !== 0) {
          return errAsync(
            new BilibiliApiError({
              message: data.message,
              msgCode: data.code,
              rawData: data.data,
              type: 'ResponseFailed',
            }),
          )
        }
        return okAsync(data.data)
      })
  }

  /**
   * 发送 GET 请求
   */
  get<T>({
    endpoint,
    params,
    fullUrl,
    skipCookie,
    signal,
  }: {
    endpoint: string
    params?: Record<string, string | undefined> | string
    fullUrl?: string
    skipCookie?: boolean
    signal?: AbortSignal
  }): ResultAsync<T, BilibiliApiError> {
    let url = endpoint
    if (typeof params === 'string') {
      url = `${endpoint}?${params}`
    } else if (params) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, value)
        }
      }
      url = `${endpoint}?${searchParams.toString()}`
    }
    return this.request<T>({
      endpoint: url,
      options: { method: 'GET', signal },
      fullUrl,
      skipCookie,
    })
  }

  /**
   * 发送 GET 请求并返回 ArrayBuffer
   */
  getBuffer({
    endpoint,
    params,
    headers,
    fullUrl,
    skipCookie,
    signal,
  }: {
    endpoint: string
    params?: Record<string, string | undefined> | string
    headers?: Record<string, string>
    fullUrl?: string
    skipCookie?: boolean
    signal?: AbortSignal
  }): ResultAsync<ArrayBuffer, BilibiliApiError> {
    let url = endpoint
    if (typeof params === 'string') {
      url = `${endpoint}?${params}`
    } else if (params) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, value)
        }
      }
      url = `${endpoint}?${searchParams.toString()}`
    }
    const requestUrl = fullUrl ?? `${this.baseUrl}${url}`
    const cookie =
      !skipCookie && appState.hasBilibiliCookie()
        ? appState.getBilibiliCookieHeader()
        : ''

    const requestHeaders = {
      Cookie: cookie,
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0',
      Referer: 'https://www.bilibili.com/',
      Origin: 'https://www.bilibili.com',
      ...headers,
    }

    return ResultAsync.fromPromise(
      fetch(requestUrl, {
        method: 'GET',
        headers: requestHeaders,
        signal,
        credentials: 'omit',
      }),
      toRequestError,
    ).andThen((response) => {
      if (!response.ok) {
        return errAsync(
          new BilibiliApiError({
            message: `请求 bilibili API 失败: ${response.status} ${response.statusText}`,
            msgCode: response.status,
            type: 'RequestFailed',
          }),
        )
      }
      return ResultAsync.fromPromise(
        response.arrayBuffer(),
        (error) =>
          new BilibiliApiError({
            message:
              error instanceof Error ? error.message : String(error),
            type: 'ResponseFailed',
          }),
      )
    })
  }

  /**
   * 发送 POST 请求
   */
  post<T>({
    endpoint,
    data,
    headers,
    fullUrl,
    skipCookie,
  }: {
    endpoint: string
    data?: BodyInit
    headers?: Record<string, string>
    fullUrl?: string
    skipCookie?: boolean
  }): ResultAsync<T, BilibiliApiError> {
    return this.request<T>({
      endpoint,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...headers,
        },
        body: data,
      },
      fullUrl,
      skipCookie,
    })
  }

  /**
   * 自动处理 CSRF token 并发送 POST 请求 (x-www-form-urlencoded)
   */
  public postWithCsrf<T>({
    endpoint,
    payload = {},
  }: {
    endpoint: string
    payload?: Record<string, string>
  }): ResultAsync<T, BilibiliApiError> {
    const csrfResult = getCsrfToken(appState.bilibiliCookie)
    return csrfResult.asyncAndThen((csrfToken) => {
      const dataWithCsrf = {
        ...payload,
        csrf: csrfToken,
      }

      const body = new URLSearchParams(dataWithCsrf).toString()

      return this.post<T>({ endpoint, data: body })
    })
  }
}
export const bilibiliApiClient = new ApiClient()
