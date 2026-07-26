// AppState 模块级单例（替代 BBPlayer 的 Zustand useAppStore）
// 持久化到 app.getPath('userData')/state.json
// 字段：bilibiliCookie / bilibiliUserInfo / sendPlayHistory / wbiKeys（不持久化）
import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { err, ok, type Result } from 'neverthrow'

import {
  parseCookieToObject,
  serializeCookieObject,
} from './cookie'

export interface BilibiliUserSummary {
  mid?: number
  name?: string
  face?: string
  cachedAt?: number
}

interface PersistedState {
  bilibiliCookie: Record<string, string> | null
  bilibiliUserInfo: BilibiliUserSummary | null
  sendPlayHistory: boolean
}

class AppState {
  bilibiliCookie: Record<string, string> | null = null
  bilibiliUserInfo: BilibiliUserSummary | null = null
  sendPlayHistory = true
  // wbi_keys 不持久化（每日刷新即可）
  wbiKeys: { img_key: string; sub_key: string; timestamp: number } | null = null

  private get filePath(): string {
    return join(app.getPath('userData'), 'state.json')
  }

  load(): void {
    try {
      if (!existsSync(this.filePath)) {
        console.log(`[AppState] state.json 不存在（首次启动）：${this.filePath}`)
        return
      }
      const raw = readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(raw) as Partial<PersistedState>
      if (data.bilibiliCookie !== undefined)
        this.bilibiliCookie = data.bilibiliCookie
      if (data.bilibiliUserInfo !== undefined)
        this.bilibiliUserInfo = data.bilibiliUserInfo
      if (data.sendPlayHistory !== undefined)
        this.sendPlayHistory = data.sendPlayHistory
      console.log(
        `[AppState] state.json 已加载（路径: ${this.filePath}, cookie: ${this.hasBilibiliCookie() ? '有' : '无'}, userInfo: ${this.bilibiliUserInfo ? '有' : '无'}）`,
      )
    } catch (error) {
      console.error('[AppState] 加载 state.json 失败:', error)
    }
  }

  save(): void {
    try {
      const data: PersistedState = {
        bilibiliCookie: this.bilibiliCookie,
        bilibiliUserInfo: this.bilibiliUserInfo,
        sendPlayHistory: this.sendPlayHistory,
      }
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
      console.log(
        `[AppState] state.json 已保存到 ${this.filePath}（cookie: ${this.hasBilibiliCookie() ? '有' : '无'}）`,
      )
    } catch (error) {
      console.error('[AppState] 保存 state.json 失败:', error)
    }
  }

  hasBilibiliCookie(): boolean {
    return (
      !!this.bilibiliCookie && Object.keys(this.bilibiliCookie).length > 0
    )
  }

  setBilibiliCookie(cookieString: string): Result<void, Error> {
    const result = parseCookieToObject(cookieString)
    if (result.isErr()) {
      return err(result.error)
    }
    this.bilibiliCookie = result.value
    this.save()
    return ok(undefined)
  }

  /**
   * 返回当前 cookie 序列化后的字符串（供 API client 注入 Cookie 头）
   */
  getBilibiliCookieHeader(): string {
    if (!this.bilibiliCookie) return ''
    return serializeCookieObject(this.bilibiliCookie)
  }

  updateBilibiliCookie(updates: Record<string, string>): void {
    const newCookie = { ...(this.bilibiliCookie ?? {}), ...updates }
    this.bilibiliCookie = newCookie
    this.save()
  }

  clearBilibiliCookie(): void {
    this.bilibiliCookie = null
    this.bilibiliUserInfo = null
    this.save()
  }

  setBilibiliUserInfo(info: BilibiliUserSummary | null): void {
    this.bilibiliUserInfo = info
    this.save()
  }
}

export const appState = new AppState()
