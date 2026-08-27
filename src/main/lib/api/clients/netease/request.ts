// 请求封装（1:1 复刻 BBPlayer apps/mobile/src/lib/api/netease/request.ts）
// 改动：
// - 删除 `import { Buffer } from 'buffer'`（Node 原生全局 Buffer）
// - fetch 用 Node 全局 fetch（undici），与 bilibili/kugou client 一致
// - NeteaseApiError → ThirdPartyError（vendor: 'Netease'，与 kugou/qqmusic client 模式一致）
import type { Result } from 'neverthrow'
import { ResultAsync, err, ok } from 'neverthrow'
import * as setCookie from 'set-cookie-parser'

import { ThirdPartyError } from '../../../errors'

import * as Encrypt from './crypto'
import { cookieObjToString, cookieToJson, toBoolean } from './utils'

interface AppConfig {
	domain: string
	apiDomain: string
	encryptResponse: boolean
}

const APP_CONF: AppConfig = {
	domain: 'https://music.163.com',
	apiDomain: 'https://interface3.music.163.com',
	encryptResponse: true,
}

const chooseUserAgent = (uaType: 'pc' | 'linux' | 'iphone' = 'pc'): string => {
	const userAgentMap: Record<string, string> = {
		pc: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
		linux:
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
		iphone: 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)',
	}
	return userAgentMap[uaType] || userAgentMap.pc
}

export interface RequestOptions {
	cookie?: Record<string, string> | string
	ua?: string
	crypto?: 'weapi' | 'linuxapi' | 'eapi'
	headers?: Record<string, string>
	e_r?: boolean
	signal?: AbortSignal
}

interface RequestPayload {
	url: string
	headers: Record<string, string>
	body: object
	e_r: boolean
	signal?: AbortSignal
}

/**
 * 把未知错误包装成 ThirdPartyError（vendor: 'Netease'）
 */
function toNeteaseError(
	message: string,
	type: 'RequestFailed' | 'ResponseFailed',
	opts?: { msgCode?: number; rawData?: unknown; cause?: unknown },
): ThirdPartyError {
	return new ThirdPartyError(message, {
		vendor: 'Netease',
		type,
		data: { msgCode: opts?.msgCode, rawData: opts?.rawData },
		cause: opts?.cause,
	})
}

const buildRequestPayload = <T extends object>(
	uri: string,
	data: T,
	options: RequestOptions,
): RequestPayload => {
	const { ua, crypto = 'weapi', signal } = options
	const cookie =
		typeof options.cookie === 'string'
			? cookieToJson(options.cookie)
			: (options.cookie ?? {})

	const csrfToken = cookie.__csrf || ''
	let url = ''
	const headers: Record<string, string> = {
		'User-Agent':
			ua ?? chooseUserAgent(crypto === 'linuxapi' ? 'linux' : 'iphone'),
		'Content-Type': 'application/x-www-form-urlencoded',
		Referer: APP_CONF.domain,
		...options.headers,
	}
	let body = {}
	let e_r = false

	switch (crypto) {
		case 'weapi': {
			const weapiData = { ...data, csrf_token: csrfToken }
			body = Encrypt.weapi(weapiData)
			url = `${APP_CONF.domain}/weapi/${uri.substring(5)}`
			break
		}
		case 'linuxapi': {
			body = Encrypt.linuxapi({
				method: 'POST',
				url: APP_CONF.domain + uri,
				params: data,
			})
			url = `${APP_CONF.domain}/api/linux/forward`
			break
		}
		case 'eapi': {
			const header = {
				osver: cookie.osver || '',
				deviceId: cookie.deviceId || '',
				os: cookie.os || 'iphone',
				appver: cookie.appver || '9.0.90',
				__csrf: csrfToken,
			}
			const eapiData = {
				...data,
				header,
				e_r: toBoolean(options.e_r ?? APP_CONF.encryptResponse),
			}
			e_r = eapiData.e_r
			body = Encrypt.eapi(uri, eapiData)
			url = `${APP_CONF.apiDomain}/eapi/${uri.substring(5)}`
			headers.Cookie = cookieObjToString(header)
			break
		}
		default:
		// pass
	}

	return { url, headers, body, e_r, signal }
}

interface FetchResult<TReturnBody> {
	body: TReturnBody
	cookie: string[]
}

const executeFetch = <TReturnBody>(
	payload: RequestPayload,
): ResultAsync<FetchResult<TReturnBody>, ThirdPartyError> => {
	const { url, headers, body, e_r, signal } = payload
	const settings: RequestInit = {
		method: 'POST',
		headers,
		body: new URLSearchParams(body as Record<string, string>).toString(),
		signal: signal,
	}

	return ResultAsync.fromPromise(
		fetch(url, settings).then(async (res) => {
			if (!res.ok) {
				return err(
					toNeteaseError('请求失败！http 状态码不符合预期！', 'ResponseFailed', {
						msgCode: res.status,
						rawData: res.statusText,
					}),
				)
			}

			const responseBody = (
				e_r
					? Encrypt.eapiResDecrypt(
							Buffer.from(await res.arrayBuffer())
								.toString('hex')
								.toUpperCase(),
						)
					: await res.json()
			) as TReturnBody

			const parsedCookies = setCookie.parse(res.headers.get('set-cookie') ?? '')
			const cookies = parsedCookies.map(
				(cookie) => `${cookie.name}=${cookie.value}`,
			)

			return ok({
				body: responseBody,
				cookie: cookies,
			})
		}),
		(e: unknown) =>
			// 按理来说不应该发生
			toNeteaseError('请求失败！', 'RequestFailed', { cause: e }),
	).andThen((res) => res as Result<FetchResult<TReturnBody>, ThirdPartyError>)
}

export const createRequest = <TData extends object, TReturnBody>(
	uri: string,
	data: TData,
	options: RequestOptions,
): ResultAsync<FetchResult<TReturnBody>, ThirdPartyError> => {
	const payloadResult = buildRequestPayload(uri, data, options)

	return executeFetch(payloadResult)
}
