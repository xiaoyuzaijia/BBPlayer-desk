// 渲染进程 B 站类型 re-export（从 shared/ipc-types 派生）
// 隔离 shared 路径，组件只从本文件 import
export type {
  BilibiliFavoriteFolder,
  BilibiliFavoriteListContents,
  BilibiliFavoriteMedia,
} from '../../shared/ipc-types'
