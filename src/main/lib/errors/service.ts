// Service 层错误工厂（迁移自 BBPlayer apps/mobile/src/lib/errors/service.ts）
// 去掉 skin 相关错误（本项目不实现装扮系统）
import { ServiceError } from './index'

export type ServiceErrorType =
  | 'TrackNotFound'
  | 'ArtistNotFound'
  | 'PlaylistNotFound'
  | 'PlaylistAlreadyExists'
  | 'TrackNotInPlaylist'
  | 'ArtistAlreadyExists'
  | 'Validation'
  | 'NotImplemented'

export function createServiceError(
  type: ServiceErrorType,
  message: string,
  options?: { data?: unknown; cause?: unknown },
): ServiceError {
  return new ServiceError(message, {
    type,
    data: options?.data,
    cause: options?.cause,
  })
}

export function createTrackNotFound(
  trackId: number | string,
  cause?: unknown,
): ServiceError {
  return createServiceError('TrackNotFound', `未找到 track ${trackId}`, {
    data: { trackId },
    cause,
  })
}

export function createArtistNotFound(
  artistId: number | string,
  cause?: unknown,
): ServiceError {
  return createServiceError('ArtistNotFound', `未找到 artist ${artistId}`, {
    data: { artistId },
    cause,
  })
}

export function createPlaylistNotFound(
  playlistId: number | string,
  cause?: unknown,
): ServiceError {
  return createServiceError('PlaylistNotFound', `未找到 playlist ${playlistId}`, {
    data: { playlistId },
    cause,
  })
}

export function createTrackNotInPlaylist(
  trackId: number | string,
  playlistId: number | string,
  cause?: unknown,
): ServiceError {
  return createServiceError(
    'TrackNotInPlaylist',
    `track ${trackId} 不在 playlist ${playlistId} 中`,
    { data: { trackId, playlistId }, cause },
  )
}

export function createValidationError(
  message = '参数校验失败',
  cause?: unknown,
): ServiceError {
  return createServiceError('Validation', message, { cause })
}

export function createNotImplementedError(
  message = '未实现',
  cause?: unknown,
): ServiceError {
  return createServiceError('NotImplemented', message, { cause })
}

export function createPlaylistAlreadyExists(
  title: string,
  cause?: unknown,
): ServiceError {
  return createServiceError(
    'PlaylistAlreadyExists',
    `播放列表 "${title}" 已存在`,
    { data: { title }, cause },
  )
}

export { DatabaseError } from './index'
