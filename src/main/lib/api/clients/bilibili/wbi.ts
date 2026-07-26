// WBI 签名（迁移自 BBPlayer apps/mobile/src/lib/api/bilibili/wbi.ts）
// 改动：
// - md5 第三方包 → Node 原生 crypto.createHash('md5')
// - mmkv storage → 模块级变量（每日刷新，不持久化跨启动）
// - import 路径相对化
import { createHash } from 'node:crypto'
import { okAsync, type ResultAsync } from 'neverthrow'

import log from '../../../utils/log'
import { BilibiliApiError } from '../../../errors/bilibili'

import { bilibiliApiClient } from './client'

const logger = log.extend('3Party.Bilibili.Wbi')

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
]

// 对 imgKey 和 subKey 进行字符顺序打乱编码
const getMixinKey = (orig: string) =>
  mixinKeyEncTab
    .map((n) => orig[n])
    .join('')
    .slice(0, 32)

// 为请求参数进行 wbi 签名
function encWbi(
  params: Record<string, string | number | object>,
  img_key: string,
  sub_key: string,
) {
  const mixin_key = getMixinKey(img_key + sub_key)
  const curr_time = Math.round(Date.now() / 1000)
  const chr_filter = /[!'()*]/g

  Object.assign(params, { wts: curr_time }) // 添加 wts 字段
  // 按照 key 重排参数
  const query = Object.keys(params)
    .sort()
    .map((key) => {
      // 过滤 value 中的 "!'()*" 字符
      const value = (params[key] as { toString: () => string })
        .toString()
        .replace(chr_filter, '')
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    })
    .join('&')

  const wbi_sign = createHash('md5').update(query + mixin_key).digest('hex')

  return `${query}&w_rid=${wbi_sign}`
}

function isSameDayAsToday(timestamp: number) {
  const dateToCompare = new Date(timestamp)

  if (Number.isNaN(dateToCompare.getTime())) {
    logger.error('提供的时间戳无效:', timestamp)
    return false
  }

  const now = new Date()

  return (
    dateToCompare.getFullYear() === now.getFullYear() &&
    dateToCompare.getMonth() === now.getMonth() &&
    dateToCompare.getDate() === now.getDate()
  )
}

interface WbiKeys {
  img_key: string
  sub_key: string
  timestamp: number // 获取时间
}

// 模块级缓存（替代 mmkv storage，每日刷新，不持久化跨启动）
let cachedWbiKeys: WbiKeys | null = null

/**
 * 获取最新的 img_key 和 sub_key
 */
function getWbiKeys(): ResultAsync<
  {
    img_key: string
    sub_key: string
  },
  BilibiliApiError
> {
  if (cachedWbiKeys) {
    if (isSameDayAsToday(cachedWbiKeys.timestamp)) {
      return okAsync(cachedWbiKeys)
    }
    logger.debug('本地 wbi_keys 已过期，重新获取')
  }
  const result = bilibiliApiClient.get<{
    wbi_img: { img_url: string; sub_url: string }
  }>({ endpoint: '/x/web-interface/nav' })
  return result.map(({ wbi_img: { img_url, sub_url } }) => {
    const img_key = img_url.slice(
      img_url.lastIndexOf('/') + 1,
      img_url.lastIndexOf('.'),
    )
    const sub_key = sub_url.slice(sub_url.lastIndexOf('/') + 1)
    cachedWbiKeys = {
      img_key: img_key,
      sub_key: sub_key,
      timestamp: Date.now(),
    }
    return { img_key: img_key, sub_key: sub_key }
  })
}

export default function getWbiEncodedParams(
  params: Record<string, string | number | object>,
) {
  const result = getWbiKeys()
  return result.map(({ img_key, sub_key }) => encWbi(params, img_key, sub_key))
}
