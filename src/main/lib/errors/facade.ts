// Facade 层错误工厂（复刻 BBPlayer apps/mobile/src/lib/errors/facade.ts）
// 去掉 sharedPlaylist / dynamic playlist 相关错误（本项目不实现）
import { FacadeError } from './index'

export type FacadeErrorType =
  | 'SyncTaskAlreadyRunning'
  | 'SyncCollectionFailed'
  | 'SyncMultiPageFailed'
  | 'SyncFavoriteFailed'
  | 'FetchRemotePlaylistMetadataFailed'
  | 'PlaylistDuplicateFailed'
  | 'BatchAddTracksToLocalPlaylistFailed'
  | 'PlaylistCreateFailed'
  | 'RemoveTracksFromPlaylistFailed'
  | 'ReorderPlaylistTrackFailed'
  | 'UpdatePlaylistMetadataFailed'
  | 'PlaylistDeleteFailed'

export function createSyncTaskAlreadyRunningError(cause?: unknown): FacadeError {
  return new FacadeError('同步任务正在进行中，请稍后再试', {
    type: 'SyncTaskAlreadyRunning',
    cause,
  })
}

export function createFacadeError(
  type: FacadeErrorType,
  message: string,
  options?: { data?: unknown; cause?: unknown },
): FacadeError {
  return new FacadeError(message, {
    type,
    data: options?.data,
    cause: options?.cause,
  })
}
