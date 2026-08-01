// B 站 API 类型定义（精简版）
// 从 BBPlayer apps/mobile/src/types/apis/bilibili.ts 迁移
// 删除 garb / 弹幕 / 评论 / 音频流 等未使用的类型
// api.ts 中未建模的方法返回类型用 unknown 占位

/**
 * 用户详细信息（getUserInfo / getOtherUserInfo 返回）
 */
export interface BilibiliUserInfo {
  mid: number
  name: string
  face: string
  sign: string
}

/**
 * 二维码登录状态枚举（B 站 API 返回 code）
 * 用 const 对象 + 类型字面量代替 enum，符合 erasableSyntaxOnly
 */
export const BilibiliQrCodeLoginStatus = {
  QRCODE_LOGIN_STATUS_WAIT: 86101, // 等待扫码
  QRCODE_LOGIN_STATUS_SCANNED_BUT_NOT_CONFIRMED: 86090, // 扫码但未确认
  QRCODE_LOGIN_STATUS_SUCCESS: 0, // 扫码成功
  QRCODE_LOGIN_STATUS_QRCODE_EXPIRED: 86038, // 二维码已过期
} as const

export type BilibiliQrCodeLoginStatus =
  (typeof BilibiliQrCodeLoginStatus)[keyof typeof BilibiliQrCodeLoginStatus]

/**
 * 手机号登录 - 获取验证码图形验证信息（预留，当前未接 UI）
 */
export interface BilibiliCaptchaTokenData {
  token: string
  geetest: {
    gt: string
    challenge: string
  }
  tencent: {
    appid: string
  }
}

/**
 * 手机号登录 - 发送短信验证码结果（预留）
 */
export interface BilibiliSmsSendData {
  captcha_key: string
}

/**
 * 手机号登录 - 登录结果（预留）
 */
export interface BilibiliSmsLoginData {
  status: number
  message: string
  url: string
  mid: number
  access_token: string
  refresh_token: string
  expires_in: number
  token_info: {
    mid: number
    access_token: string
    refresh_token: string
    expires_in: number
  } | null
}

// ##################################
// 歌单同步所需的 API 响应类型
// 从 BBPlayer apps/mobile/src/types/apis/bilibili.ts 精简迁移
// 仅保留 syncBilibiliPlaylist facade 用到的类型
// ##################################

/**
 * 视频详情接口返回的 pages 字段
 */
export interface BilibiliVideoDetailsPage {
  part: string
  duration: number
  cid: number
}

/**
 * 通过 /x/web-interface/view 接口获取的视频完整信息
 * 对应 bilibiliApi.getVideoDetails
 */
export interface BilibiliVideoDetails {
  aid: number
  bvid: string
  title: string
  pic: string
  pubdate: number
  duration: number
  desc: string
  owner: {
    name: string
    mid: number
    face: string
  }
  cid: number
  pages: BilibiliVideoDetailsPage[]
}

/**
 * 收藏夹内容项
 * 对应 bilibiliApi.getFavoriteListContents 返回 medias 数组中的元素
 */
export interface BilibiliFavoriteListContent {
  id: number
  bvid: string
  upper: {
    mid: number
    name: string
    face: string
  }
  title: string
  cover: string
  duration: number
  pubdate: number
  page: number
  type: number // 2：视频稿件 12：音频 21：视频合集
  attr: number // 失效标记：0 正常；9 up自己删除；1 其他原因删除
}

/**
 * 收藏夹内容列表（分页）
 * 对应 bilibiliApi.getFavoriteListContents 返回
 */
export interface BilibiliFavoriteListContents {
  info: {
    id: number
    title: string
    cover: string
    media_count: number
    intro: string
    upper: {
      name: string
      face: string
      mid: number
    }
  } | null
  medias: BilibiliFavoriteListContent[] | null
  has_more: boolean
  ttl: number
}

/**
 * 收藏夹所有内容（仅 ID）
 * 对应 bilibiliApi.getFavoriteListAllContents 返回
 */
export type BilibiliFavoriteListAllContents = {
  id: number
  bvid: string
  type: number
}[]

/**
 * 合集详情信息
 */
export interface BilibiliCollectionInfo {
  id: number
  season_type: number
  title: string
  cover: string
  upper: {
    mid: number
    name: string
  }
  cnt_info: {
    collect: number
    play: number
    danmaku: number
  }
  media_count: number
  intro: string
}

/**
 * 合集内单个内容
 */
export interface BilibiliMediaItemInCollection {
  id: number
  title: string
  cover: string
  duration: number
  pubtime: number
  bvid: string
  upper: {
    mid: number
    name: string
  }
  cnt_info: {
    collect: number
    play: number
    danmaku: number
  }
}

/**
 * /x/space/fav/season/list 合集内容
 * 对应 bilibiliApi.getCollectionAllContents 返回
 */
export interface BilibiliCollectionAllContents {
  info: BilibiliCollectionInfo
  medias: BilibiliMediaItemInCollection[] | null
}
