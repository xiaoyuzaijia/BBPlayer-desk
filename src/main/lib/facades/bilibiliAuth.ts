// Bilibili 账号业务 facade
// 跨资源编排：bilibiliApi + appState + 状态推送给渲染进程
// IPC handler 只调本 facade，不直接碰 bilibiliApi / appState
// 参考 BBPlayer apps/mobile/src/lib/facades/bilibili.ts 的 class 风格
import type { BrowserWindow } from 'electron'

import { bilibiliApi } from '../api/clients/bilibili/api'
import { BilibiliQrCodeLoginStatus } from '../../types/bilibili'
import { appState } from '../config/store'
import log from '../utils/log'
import { AUTH_CHANNELS } from '../../../shared/ipc-channels'
import type {
  AuthStateSnapshot,
  BilibiliUserInfo,
  QrStatus,
} from '../../../shared/ipc-types'

const logger = log.extend('Facade.BilibiliAuth')

/**
 * Bilibili 账号业务 facade
 * - 扫码登录全链路（申请二维码 + 轮询 + 写 cookie + 推送状态）
 * - 退出登录
 * - 拉取并缓存用户信息
 *
 * 不持有 BrowserWindow 引用（避免窗口关闭后内存泄漏），所有需要推送的方法接受 mainWindow 作为参数
 */
export class BilibiliAuthFacade {
  private pollingTimer: ReturnType<typeof setInterval> | null = null
  private qrcodeKey: string | null = null

  /**
   * 启动扫码登录流程
   * 1. 停止上一次轮询
   * 2. 推送 generating 状态
   * 3. 调 B 站 API 申请二维码
   * 4. 推送 polling 状态（含 url，渲染进程生成二维码图）
   * 5. setInterval 2s 轮询 pollQrCodeLoginStatus
   */
  startQrLogin(mainWindow: BrowserWindow): void {
    this.cancelQrLogin()
    this.sendQrStatus(mainWindow, { state: 'generating' })

    bilibiliApi.getLoginQrCode().match(
      (data) => {
        this.qrcodeKey = data.qrcode_key
        this.sendQrStatus(mainWindow, { state: 'polling', url: data.url })
        this.pollingTimer = setInterval(() => {
          void this.pollOnce(mainWindow)
        }, 2000)
      },
      (error) => {
        logger.error('申请二维码失败:', error.message)
        this.sendQrStatus(mainWindow, {
          state: 'error',
          message: error.message,
        })
      },
    )
  }

  /**
   * 停止扫码登录（清 timer + 清 qrcodeKey）
   * 窗口关闭 / 用户取消 / 登录成功 / 二维码过期 时调用
   */
  cancelQrLogin(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
      this.pollingTimer = null
    }
    this.qrcodeKey = null
  }

  /**
   * 退出登录：停轮询 + 清 cookie + 推送登录态变化
   */
  logout(mainWindow: BrowserWindow): void {
    this.cancelQrLogin()
    appState.clearBilibiliCookie()
    this.sendAuthStateChanged(mainWindow)
  }

  /**
   * 拉取当前登录用户信息并缓存
   * 未登录时返回错误，不发请求
   */
  async fetchUserInfo(
    mainWindow: BrowserWindow,
  ): Promise<
    | { ok: true; data: BilibiliUserInfo }
    | { ok: false; error: { code: 'NOT_LOGGED_IN' | 'BILIBILI_REJECTED'; message: string } }
  > {
    if (!appState.hasBilibiliCookie()) {
      return {
        ok: false,
        error: { code: 'NOT_LOGGED_IN', message: '未登录' },
      }
    }
    const result = await bilibiliApi.getUserInfo()
    return result.match<{
      ok: true
      data: BilibiliUserInfo
    } | {
      ok: false
      error: { code: 'BILIBILI_REJECTED'; message: string }
    }>(
      (data) => {
        appState.setBilibiliUserInfo({
          mid: data.mid,
          name: data.name,
          face: data.face,
          cachedAt: Date.now(),
        })
        this.sendAuthStateChanged(mainWindow)
        return { ok: true, data }
      },
      (error) => {
        logger.error('getUserInfo 失败:', error.message)
        return {
          ok: false,
          error: { code: 'BILIBILI_REJECTED', message: error.message },
        }
      },
    )
  }

  /**
   * 推送登录态快照给渲染进程
   * 在扫码登录成功 / 退出 / getUserInfo 成功时触发
   * 渲染进程 auth store 订阅后更新 isLoggedIn，触发 useBilibiliUserInfo 查询
   */
  sendAuthStateChanged(mainWindow: BrowserWindow): void {
    const snapshot: AuthStateSnapshot = {
      isLoggedIn: appState.hasBilibiliCookie(),
      userInfo: appState.bilibiliUserInfo,
    }
    mainWindow.webContents.send(AUTH_CHANNELS.stateChanged, snapshot)
  }

  /**
   * 单次轮询：调 B 站 poll API，根据 code 推送状态
   */
  private async pollOnce(mainWindow: BrowserWindow): Promise<void> {
    if (!this.qrcodeKey) return

    const result = await bilibiliApi.pollQrCodeLoginStatus({
      qrcodeKey: this.qrcodeKey,
    })

    result.match(
      (data) => {
        switch (data.status) {
          case BilibiliQrCodeLoginStatus.QRCODE_LOGIN_STATUS_WAIT:
            // 86101 等待扫码，不重复推送（保持 polling 状态）
            break
          case BilibiliQrCodeLoginStatus.QRCODE_LOGIN_STATUS_SCANNED_BUT_NOT_CONFIRMED:
            // 86090 已扫码等待确认
            this.sendQrStatus(mainWindow, { state: 'scanned' })
            break
          case BilibiliQrCodeLoginStatus.QRCODE_LOGIN_STATUS_SUCCESS: {
            // 0 成功：写入 cookie + 推送 success + 推送登录态变化 + 停止轮询
            const cookieResult = appState.setBilibiliCookie(data.cookies)
            if (cookieResult.isErr()) {
              logger.error('cookie 解析失败:', cookieResult.error.message)
              this.sendQrStatus(mainWindow, {
                state: 'error',
                message: 'Cookie 解析失败',
              })
              this.cancelQrLogin()
              return
            }
            this.sendQrStatus(mainWindow, { state: 'success' })
            this.sendAuthStateChanged(mainWindow)
            this.cancelQrLogin()
            break
          }
          case BilibiliQrCodeLoginStatus.QRCODE_LOGIN_STATUS_QRCODE_EXPIRED:
            // 86038 过期
            this.sendQrStatus(mainWindow, { state: 'expired' })
            this.cancelQrLogin()
            break
          default:
            logger.warning('未知的扫码状态码:', data.status)
        }
      },
      (error) => {
        logger.error('轮询扫码状态失败:', error.message)
        // 网络错误不立刻终止，下次 interval 继续重试
      },
    )
  }

  /**
   * 推送扫码状态给渲染进程
   */
  private sendQrStatus(mainWindow: BrowserWindow, status: QrStatus): void {
    mainWindow.webContents.send(AUTH_CHANNELS.qrStatus, status)
  }
}

export const bilibiliAuthFacade = new BilibiliAuthFacade()
