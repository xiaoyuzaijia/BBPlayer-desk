// B 站 API 类型定义（精简版）
// 从 BBPlayer apps/mobile/src/types/apis/bilibili.ts 迁移
// 删除 garb / 弹幕 / 评论 / 音频流 等本阶段用不到的类型
// api.ts 中其他方法返回类型暂用 unknown 占位

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
 */
export enum BilibiliQrCodeLoginStatus {
  QRCODE_LOGIN_STATUS_WAIT = 86101, // 等待扫码
  QRCODE_LOGIN_STATUS_SCANNED_BUT_NOT_CONFIRMED = 86090, // 扫码但未确认
  QRCODE_LOGIN_STATUS_SUCCESS = 0, // 扫码成功
  QRCODE_LOGIN_STATUS_QRCODE_EXPIRED = 86038, // 二维码已过期
}

/**
 * 手机号登录 - 获取验证码图形验证信息（预留，本阶段不实现）
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
