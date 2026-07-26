// 全局 Window.api 类型声明
// 类型来源：preload/index.ts 的 Api 类型
import type { Api } from '../../preload/index'

declare global {
  interface Window {
    api: Api
  }
}
