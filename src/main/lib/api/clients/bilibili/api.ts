// B 站 API 客户端类（迁移自 BBPlayer apps/mobile/src/lib/api/bilibili/api.ts）
// 改动：
// - 删除所有 @/types/... import，本阶段用得到的类型从 ../../types/bilibili 导入，其他方法返回类型用 unknown 占位
// - 删除 ./proto/dm 弹幕 import + getSegDanmaku 方法
// - 删除所有 garb 相关方法（依赖 garb 模块）
// - getAudioStream 返回类型 unknown（删除 BilibiliTrack 依赖）
// - pollQrCodeLoginStatus: Node fetch getSetCookie 适配（headers.getSetCookie() 拿全所有 Set-Cookie）
// - getSearchSuggestions: useAppStore.getState().bilibiliCookie?.mid → appState.bilibiliCookie?.DedeUserID
// - import 路径相对化
import { errAsync, okAsync, ResultAsync } from 'neverthrow'

import { BilibiliApiError } from '../../../errors/bilibili'
import { appState } from '../../../config/store'
import log from '../../../utils/log'
import type {
  BilibiliCaptchaTokenData,
  BilibiliSmsLoginData,
  BilibiliSmsSendData,
  BilibiliUserInfo,
} from '../../../../types/bilibili'
import { BilibiliQrCodeLoginStatus } from '../../../../types/bilibili'

import { bilibiliApiClient } from './client'
import { bv2av } from './utils'
import getWbiEncodedParams from './wbi'

const logger = log.extend('3Party.Bilibili.Api')

/**
 * Bilibili passport API 请求所使用的 User-Agent
 */
const PASSPORT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0'

/**
 * B站 API 客户端类
 */
export class BilibiliApi {
  /**
   * 获取用户观看历史记录
   */
  getHistory({ signal }: { signal?: AbortSignal } = {}): ResultAsync<
    unknown[],
    BilibiliApiError
  > {
    return bilibiliApiClient.get<unknown[]>({
      endpoint: '/x/v2/history',
      signal,
    })
  }

  /**
   * 获取分区热门视频
   */
  getPopularVideos({
    partition,
    signal,
  }: {
    partition: string
    signal?: AbortSignal
  }): ResultAsync<unknown[], BilibiliApiError> {
    return bilibiliApiClient
      .get<{ list: unknown[] } | null>({
        endpoint: `/x/web-interface/ranking/v2?rid=${partition}`,
        signal,
      })
      .map((response) => response?.list ?? [])
  }

  /**
   * 获取用户收藏夹列表
   */
  getFavoritePlaylists({
    userMid,
    signal,
  }: {
    userMid: number
    signal?: AbortSignal
  }): ResultAsync<unknown[], BilibiliApiError> {
    return bilibiliApiClient
      .get<{ list: unknown[] | null } | null>({
        endpoint: `/x/v3/fav/folder/created/list-all?up_mid=${userMid}`,
        signal,
      })
      .map((response) => response?.list ?? [])
  }

  /**
   * 创建收藏夹
   */
  createFavoriteFolder({
    title,
    intro,
    cover,
    privacy = 0,
  }: {
    title: string
    intro?: string
    cover?: string
    privacy?: 0 | 1
  }): ResultAsync<
    { id: number; title: string; mid: number; fid: number },
    BilibiliApiError
  > {
    return bilibiliApiClient.postWithCsrf<{
      id: number
      fid: number
      mid: number
      title: string
    }>({
      endpoint: '/x/v3/fav/folder/add',
      payload: {
        title,
        intro: intro ?? '',
        privacy: String(privacy),
        cover: cover ?? '',
      },
    })
  }

  /**
   * 搜索视频
   */
  searchVideos({
    keyword,
    page,
    skipCookie,
    signal,
  }: {
    keyword: string
    page: number
    skipCookie?: boolean
    signal?: AbortSignal
  }): ResultAsync<
    { result: unknown[]; numPages: number },
    BilibiliApiError
  > {
    const params = getWbiEncodedParams({
      keyword,
      search_type: 'video',
      page: page.toString(),
    })

    return params
      .andThen((params) => {
        return bilibiliApiClient.get<{
          result: unknown[]
          numPages: number
        }>({
          endpoint: '/x/web-interface/wbi/search/type',
          params,
          skipCookie,
          signal,
        })
      })
      .andThen((res) => {
        if (!res.result) {
          res.result = []
        }
        return okAsync(res)
      })
  }

  /**
   * 搜索 UP 主
   */
  searchUsers({
    keyword,
    page = 1,
    skipCookie,
    signal,
  }: {
    keyword: string
    page?: number
    skipCookie?: boolean
    signal?: AbortSignal
  }): ResultAsync<
    { result: unknown[]; numPages: number },
    BilibiliApiError
  > {
    const params = getWbiEncodedParams({
      keyword,
      search_type: 'bili_user',
      page: page.toString(),
    })

    return params
      .andThen((params) => {
        return bilibiliApiClient.get<{
          result: unknown[]
          numPages: number
        }>({
          endpoint: '/x/web-interface/wbi/search/type',
          params,
          skipCookie,
          signal,
        })
      })
      .andThen((res) => {
        if (!res.result) {
          res.result = []
        }
        return okAsync(res)
      })
  }

  /**
   * 获取热门搜索关键词
   */
  getHotSearches({ signal }: { signal?: AbortSignal } = {}): ResultAsync<
    unknown[],
    BilibiliApiError
  > {
    return bilibiliApiClient
      .get<{ trending: { list: unknown[] } } | null>({
        endpoint: '/x/web-interface/search/square',
        params: {
          limit: '10',
        },
        signal,
      })
      .map((response) => response?.trending.list ?? [])
  }

  /**
   * 获取搜索建议
   */
  getSearchSuggestions({
    term,
    signal,
  }: {
    term: string
    signal?: AbortSignal
  }): ResultAsync<unknown[], BilibiliApiError> {
    const params = new URLSearchParams()
    params.append('main_ver', 'v1')
    params.append('term', term)
    const bilibiliCookie = appState.bilibiliCookie
    if (bilibiliCookie?.DedeUserID) {
      params.append('userid', bilibiliCookie.DedeUserID)
    }
    const url = `https://s.search.bilibili.com/main/suggest?${params.toString()}`

    return ResultAsync.fromPromise(
      fetch(url, {
        method: 'GET',
        signal: signal,
      }),
      (e) => {
        if (e instanceof Error && e.name === 'AbortError') {
          return new BilibiliApiError({
            message: '请求被取消',
            type: 'RequestAborted',
          })
        }
        return new BilibiliApiError({
          message: e instanceof Error ? e.message : String(e),
          type: 'RequestFailed',
        })
      },
    )
      .andThen((response) => {
        if (!response.ok) {
          return errAsync(
            new BilibiliApiError({
              message: `请求 bilibili API 失败: ${response.status} ${response.statusText}`,
              msgCode: response.status,
              type: 'RequestFailed',
            }),
          )
        }
        return ResultAsync.fromPromise(
          response.json() as Promise<{
            code: number
            result: { tag: unknown[] }
          }>,
          (error) =>
            new BilibiliApiError({
              message: error instanceof Error ? error.message : String(error),
              type: 'ResponseFailed',
            }),
        )
      })
      .andThen((data) => {
        if (data.code !== 0) {
          return errAsync(
            new BilibiliApiError({
              message: `获取搜索建议失败: ${data.code}`,
              msgCode: data.code,
              type: 'RequestFailed',
            }),
          )
        }
        return okAsync(data.result.tag)
      })
  }

  /**
   * 获取视频音频流信息
   * 优先级（在 dolby 和 hi-res 都开启的情况下）：dolby > hi-res > normal
   * 本阶段返回类型用 unknown 占位（原版依赖 BilibiliTrack）
   */
  getAudioStream(
    _params: unknown,
  ): ResultAsync<unknown, BilibiliApiError> {
    // 完整实现见 BBPlayer 原版，本阶段保留方法签名供未来接入
    const { bvid, cid, audioQuality, enableDolby, enableHiRes } = _params as {
      bvid: string
      cid: number
      audioQuality: number
      enableDolby: boolean
      enableHiRes: boolean
    }
    const wbiParams = getWbiEncodedParams({
      bvid,
      cid: String(cid),
      fnval: '4048',
      fnver: '0',
      fourk: '1',
      qlt: String(audioQuality),
      voice_balance: '1',
    })

    return wbiParams
      .andThen((params) => {
        return bilibiliApiClient.get<unknown>({
          endpoint: '/x/player/wbi/playurl',
          params,
        })
      })
      .andThen((response) => {
        const { dash, durl, volume } = response as {
          dash?: {
            audio?: { id: number; baseUrl: string }[] | null
            dolby?: { audio?: { id: number; baseUrl: string }[] | null } | null
            flac?: { audio?: { id: number; baseUrl: string } | null } | null
          }
          durl?: { url: string }[]
          volume?: unknown
        }

        if (!dash) {
          if (!durl?.[0]) {
            return errAsync(
              new BilibiliApiError({
                message: '请求到的流数据不包含 dash 或 durl 任一字段',
                type: 'AudioStreamError',
              }),
            )
          }
          logger.debug('老视频不存在 dash，回退到使用 durl 音频流')
          return okAsync({
            url: durl[0].url,
            quality: 114514,
            getTime: Date.now() + 60 * 1000,
            type: 'mp4' as const,
            volume,
          })
        }

        if (enableDolby && dash?.dolby?.audio && dash.dolby.audio.length > 0) {
          logger.debug('优先使用 Dolby 音频流')
          return okAsync({
            url: dash.dolby.audio[0].baseUrl,
            quality: dash.dolby.audio[0].id,
            getTime: Date.now() + 60 * 1000,
            type: 'dash' as const,
            volume,
          })
        }

        if (enableHiRes && dash?.flac?.audio) {
          logger.debug('次级使用 Hi-Res 音频流')
          return okAsync({
            url: dash.flac.audio.baseUrl,
            quality: dash.flac.audio.id,
            getTime: Date.now() + 60 * 1000,
            type: 'dash' as const,
            volume,
          })
        }

        if (!dash?.audio || dash.audio.length === 0) {
          logger.error('未找到有效的音频流数据', { response })
          return errAsync(
            new BilibiliApiError({
              message: '未找到有效的音频流数据',
              type: 'AudioStreamError',
            }),
          )
        }

        const getTime = Date.now() + 60 * 1000
        const targetAudio = dash.audio.find(
          (audio) => audio.id === audioQuality,
        )

        if (targetAudio) {
          return okAsync({
            url: targetAudio.baseUrl,
            quality: targetAudio.id,
            getTime,
            type: 'dash' as const,
            volume,
          })
        }

        // Fallback: 使用最高质量
        logger.warning('未找到指定质量音频流，使用最高质量', {
          requestedQuality: audioQuality,
          availableQualities: dash.audio.map((a) => a.id),
        })
        const highestQualityAudio = dash.audio[0]
        if (highestQualityAudio) {
          return okAsync({
            url: highestQualityAudio.baseUrl,
            quality: highestQualityAudio.id,
            getTime,
            type: 'dash' as const,
            volume,
          })
        }

        logger.error('未能确定任何可用的音频流', { response })
        return errAsync(
          new BilibiliApiError({
            message: '未能确定 any 可用的音频流',
            type: 'AudioStreamError',
          }),
        )
      })
  }

  /**
   * 获取视频分P列表
   */
  getPageList({
    bvid,
    signal,
  }: {
    bvid: string
    signal?: AbortSignal
  }): ResultAsync<unknown[], BilibiliApiError> {
    return bilibiliApiClient.get<unknown[]>({
      endpoint: '/x/player/pagelist',
      params: {
        bvid,
      },
      signal,
    })
  }

  /**
   * 获取登录本人信息
   */
  getUserInfo({ signal }: { signal?: AbortSignal } = {}): ResultAsync<
    BilibiliUserInfo,
    BilibiliApiError
  > {
    return bilibiliApiClient.get<BilibiliUserInfo>({
      endpoint: '/x/space/myinfo',
      signal,
    })
  }

  /**
   * 获取别人用户信息
   */
  getOtherUserInfo({
    mid,
    signal,
  }: {
    mid: number
    signal?: AbortSignal
  }): ResultAsync<BilibiliUserInfo, BilibiliApiError> {
    const params = getWbiEncodedParams({
      mid: mid.toString(),
    })
    return params.andThen((params) => {
      return bilibiliApiClient.get<BilibiliUserInfo>({
        endpoint: '/x/space/wbi/acc/info',
        params,
        signal,
      })
    })
  }

  /**
   * 获取收藏夹内容(分页)
   */
  getFavoriteListContents({
    favoriteId,
    pn,
    signal,
  }: {
    favoriteId: number
    pn: number
    signal?: AbortSignal
  }): ResultAsync<unknown, BilibiliApiError> {
    return bilibiliApiClient.get<unknown>({
      endpoint: '/x/v3/fav/resource/list',
      params: {
        media_id: favoriteId.toString(),
        pn: pn.toString(),
        ps: '40',
      },
      signal,
    })
  }

  /**
   * 搜索收藏夹内容
   */
  searchFavoriteListContents({
    favoriteId,
    scope,
    pn,
    keyword,
    signal,
  }: {
    favoriteId: number
    scope: 'all' | 'this'
    pn: number
    keyword: string
    signal?: AbortSignal
  }): ResultAsync<unknown, BilibiliApiError> {
    return bilibiliApiClient
      .get<unknown>({
        endpoint: '/x/v3/fav/resource/list',
        params: {
          media_id: favoriteId.toString(),
          pn: pn.toString(),
          ps: '40',
          keyword,
          type: scope === 'this' ? '0' : '1',
        },
        signal,
      })
      .andThen((res) => {
        const data = res as { medias?: unknown[] | null }
        data.medias ??= []
        return okAsync(res)
      })
  }

  /**
   * 获取收藏夹所有视频内容（仅bvid和类型）
   */
  getFavoriteListAllContents({
    favoriteId,
    signal,
  }: {
    favoriteId: number
    signal?: AbortSignal
  }): ResultAsync<unknown[], BilibiliApiError> {
    return bilibiliApiClient
      .get<unknown[]>({
        endpoint: '/x/v3/fav/resource/ids',
        params: {
          media_id: favoriteId.toString(),
        },
        signal,
      })
      .map((response) => {
        const items = response as { type: number }[]
        return items.filter((item) => item.type === 2) // 过滤非视频稿件
      })
  }

  /**
   * 获取视频详细信息
   */
  getVideoDetails({
    bvid,
    signal,
  }: {
    bvid: string
    signal?: AbortSignal
  }): ResultAsync<unknown, BilibiliApiError> {
    return bilibiliApiClient.get<unknown>({
      endpoint: '/x/web-interface/view',
      params: {
        bvid,
      },
      signal,
    })
  }

  /**
   * 批量删除收藏夹内容
   */
  batchDeleteFavoriteListContents({
    favoriteId,
    bvids,
  }: {
    favoriteId: number
    bvids: string[]
  }): ResultAsync<0, BilibiliApiError> {
    const resourcesIds = bvids.map((bvid) => `${bv2av(bvid)}:2`)
    return bilibiliApiClient.postWithCsrf<0>({
      endpoint: '/x/v3/fav/resource/batch-del',
      payload: {
        resources: resourcesIds.join(','),
        media_id: String(favoriteId),
        platform: 'web',
      },
    })
  }

  /**
   * 获取用户追更的视频合集/收藏夹列表
   */
  getCollectionsList({
    pageNumber,
    mid,
    signal,
  }: {
    pageNumber: number
    mid: number
    signal?: AbortSignal
  }): ResultAsync<
    { list: unknown[]; count: number; hasMore: boolean },
    BilibiliApiError
  > {
    return bilibiliApiClient
      .get<{
        list: unknown[]
        count: number
        has_more: boolean
      }>({
        endpoint: '/x/v3/fav/folder/collected/list',
        params: {
          pn: pageNumber.toString(),
          ps: '20',
          up_mid: mid.toString(),
          platform: 'web',
        },
        signal,
      })
      .map((response) => ({
        list: response.list ?? [],
        count: response.count,
        hasMore: response.has_more,
      }))
  }

  /**
   * 获取合集详细信息和完整内容
   */
  getCollectionAllContents({
    collectionId,
    signal,
  }: {
    collectionId: number
    signal?: AbortSignal
  }): ResultAsync<unknown, BilibiliApiError> {
    return bilibiliApiClient.get<unknown>({
      endpoint: '/x/space/fav/season/list',
      params: {
        season_id: collectionId.toString(),
        ps: '20',
        pn: '1',
      },
      signal,
    })
  }

  /**
   * 单个视频添加/删除到多个收藏夹
   */
  dealFavoriteForOneVideo({
    bvid,
    addToFavoriteIds,
    delInFavoriteIds,
  }: {
    bvid: string
    addToFavoriteIds: string[]
    delInFavoriteIds: string[]
  }): ResultAsync<unknown, BilibiliApiError> {
    const avid = bv2av(bvid)
    const addToFavoriteIdsCombined = addToFavoriteIds.join(',')
    const delInFavoriteIdsCombined = delInFavoriteIds.join(',')

    const data = {
      rid: String(avid),
      add_media_ids: addToFavoriteIdsCombined,
      del_media_ids: delInFavoriteIdsCombined,
      type: '2',
    }
    return bilibiliApiClient.postWithCsrf<unknown>({
      endpoint: '/x/v3/fav/resource/deal',
      payload: data,
    })
  }

  /**
   * 获取目标视频的收藏情况
   */
  getTargetVideoFavoriteStatus({
    userMid,
    bvid,
    signal,
  }: {
    userMid: number
    bvid: string
    signal?: AbortSignal
  }): ResultAsync<unknown[], BilibiliApiError> {
    const avid = bv2av(bvid)
    return bilibiliApiClient
      .get<{ list: unknown[] | null }>({
        endpoint: '/x/v3/fav/folder/created/list-all',
        params: {
          up_mid: userMid.toString(),
          rid: String(avid),
          type: '2',
        },
        signal,
      })
      .map((response) => {
        if (!response.list) {
          return []
        }
        return response.list
      })
  }

  /**
   * 上报观看记录
   */
  reportPlaybackHistory({
    bvid,
    cid,
    progress,
  }: {
    bvid: string
    cid: number
    progress: number
  }): ResultAsync<0, BilibiliApiError> {
    const avid = bv2av(bvid)

    const data = {
      aid: String(avid),
      cid: String(cid),
      progress: Math.floor(progress).toString(),
    }
    return bilibiliApiClient.postWithCsrf<0>({
      endpoint: '/x/v2/history/report',
      payload: data,
    })
  }

  /**
   * 查询用户投稿视频明细
   */
  getUserUploadedVideos({
    mid,
    pn,
    keyword,
    signal,
  }: {
    mid: number
    pn: number
    keyword?: string
    signal?: AbortSignal
  }): ResultAsync<unknown, BilibiliApiError> {
    const params = getWbiEncodedParams({
      mid: mid.toString(),
      pn: pn.toString(),
      keyword: keyword ?? '',
      ps: '30',
    })
    return params.andThen((params) => {
      return bilibiliApiClient.get<unknown>({
        endpoint: '/x/space/wbi/arc/search',
        params,
        signal,
      })
    })
  }

  /**
   * 获取评论区列表
   */
  getComments({
    bvid,
    next,
    mode = 3,
    signal,
  }: {
    bvid: string
    next: number
    mode?: number
    signal?: AbortSignal
  }): ResultAsync<unknown, BilibiliApiError> {
    const avid = bv2av(bvid)
    return bilibiliApiClient.get<unknown>({
      endpoint: '/x/v2/reply/main',
      params: {
        oid: String(avid),
        type: '1',
        mode: String(mode),
        next: String(next),
        plat: '1',
      },
      signal,
    })
  }

  /**
   * 获取楼中楼（子评论）列表
   */
  getReplyComments({
    bvid,
    rpid,
    pn,
    signal,
  }: {
    bvid: string
    rpid: number
    pn: number
    signal?: AbortSignal
  }): ResultAsync<unknown, BilibiliApiError> {
    const avid = bv2av(bvid)
    return bilibiliApiClient.get<unknown>({
      endpoint: '/x/v2/reply/reply',
      params: {
        oid: String(avid),
        type: '1',
        root: String(rpid),
        pn: String(pn),
        ps: '20',
      },
      signal,
    })
  }

  /**
   * 点赞/取消点赞评论
   */
  likeComment({
    bvid,
    rpid,
    action,
  }: {
    bvid: string
    rpid: number
    action: 0 | 1
  }): ResultAsync<0, BilibiliApiError> {
    const avid = bv2av(bvid)
    return bilibiliApiClient.postWithCsrf<0>({
      endpoint: '/x/v2/reply/action',
      payload: {
        oid: String(avid),
        type: '1',
        rpid: String(rpid),
        action: String(action),
      },
    })
  }

  /**
   * 申请登录二维码
   */
  getLoginQrCode(): ResultAsync<
    { url: string; qrcode_key: string },
    BilibiliApiError
  > {
    return bilibiliApiClient.get<{ url: string; qrcode_key: string }>({
      endpoint: '',
      fullUrl:
        'https://passport.bilibili.com/x/passport-login/web/qrcode/generate',
    })
  }

  /**
   * 轮询二维码登录状态接口
   * 改造：Node fetch 的 headers.get('Set-Cookie') 只能拿到第一个
   * 改用 headers.getSetCookie() 拿全部 Set-Cookie 数组
   */
  pollQrCodeLoginStatus({
    qrcodeKey,
  }: {
    qrcodeKey: string
  }): ResultAsync<
    { status: BilibiliQrCodeLoginStatus; cookies: string },
    BilibiliApiError
  > {
    const reqFunction = async () => {
      const response = await fetch(
        `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcodeKey}`,
        {
          method: 'GET',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0',
          },
        },
      )
      if (!response.ok) {
        throw new BilibiliApiError({
          message: `请求 bilibili API 失败: ${response.status} ${response.statusText}`,
          msgCode: response.status,
          type: 'RequestFailed',
        })
      }
      const data = (await response.json()) as {
        data: { code: number }
        code: number
      }
      if (data.code !== 0) {
        throw new BilibiliApiError({
          message: `获取二维码登录状态失败: ${data.code}`,
          msgCode: data.code,
          rawData: data,
          type: 'ResponseFailed',
        })
      }
      const code = data.data.code as BilibiliQrCodeLoginStatus
      if (code !== BilibiliQrCodeLoginStatus.QRCODE_LOGIN_STATUS_SUCCESS) {
        return {
          status: code,
          cookies: '',
        }
      }
      // Node 18.14+ 支持 headers.getSetCookie()，返回所有 Set-Cookie 字符串数组
      const setCookieList = response.headers.getSetCookie()
      if (!setCookieList || setCookieList.length === 0) {
        throw new BilibiliApiError({
          message: '未获取到 Set-Cookie 头信息',
          msgCode: 0,
          rawData: null,
          type: 'ResponseFailed',
        })
      }
      // 多个 Set-Cookie 合并为 "name=value; name=value" 形式供 parseCookieToObject 解析
      return {
        status: BilibiliQrCodeLoginStatus.QRCODE_LOGIN_STATUS_SUCCESS,
        cookies: setCookieList
          .map((sc) => sc.split(';')[0]) // 每条只取 name=value 部分，丢弃 Path/Domain/Expires 等属性
          .join('; '),
      }
    }

    return ResultAsync.fromPromise(reqFunction(), (error) => {
      if (error instanceof BilibiliApiError) {
        return error
      }
      return new BilibiliApiError({
        message: error instanceof Error ? error.message : String(error),
        msgCode: 0,
        rawData: null,
        type: 'ResponseFailed',
      })
    })
  }

  /**
   * 获取 b23.tv 短链接的解析后结果
   */
  getB23ResolvedUrl({
    b23Url,
  }: {
    b23Url: string
  }): ResultAsync<string, BilibiliApiError> {
    return ResultAsync.fromPromise(
      fetch(b23Url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0',
        },
      }),
      (e) =>
        new BilibiliApiError({
          message: (e as Error).message,
          type: 'RequestFailed',
        }),
    ).andThen((response) => {
      if (!response.ok) {
        return errAsync(
          new BilibiliApiError({
            message: `请求 b23.tv 短链接失败: ${response.status} ${response.statusText}`,
            msgCode: response.status,
            type: 'RequestFailed',
          }),
        )
      }
      const responseUrl = response.url

      return ResultAsync.fromPromise(
        response.text(),
        () =>
          new BilibiliApiError({
            message: '解析响应体失败',
            type: 'ResponseFailed',
          }),
      ).andThen((html) => {
        const match = html.match(
          /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
        )
        if (match && match[1]) {
          return okAsync(match[1])
        }

        if (!responseUrl || responseUrl.includes('b23.tv')) {
          return errAsync(
            new BilibiliApiError({
              message: '未获取到 b23.tv 短链接的解析结果',
              msgCode: 0,
              rawData: null,
              type: 'ResponseFailed',
            }),
          )
        }
        return okAsync(responseUrl)
      })
    })
  }

  /**
   * 检查视频是否已经点赞
   */
  checkVideoIsThumbUp({
    bvid,
    signal,
  }: {
    bvid: string
    signal?: AbortSignal
  }): ResultAsync<0 | 1, BilibiliApiError> {
    return bilibiliApiClient.get<0 | 1>({
      endpoint: '/x/web-interface/archive/has/like',
      params: {
        bvid,
      },
      signal,
    })
  }

  /**
   * 给视频点赞或取消点赞
   * @returns 对于重复点赞的错误一律当作成功返回。
   */
  thumbUpVideo({
    bvid,
    like,
  }: {
    bvid: string
    like: boolean
  }): ResultAsync<0, BilibiliApiError> {
    const data = {
      bvid,
      like: like ? '1' : '2',
    }

    return bilibiliApiClient
      .postWithCsrf<undefined>({
        endpoint: '/x/web-interface/archive/like',
        payload: data,
      })
      .andThen(() => {
        return okAsync(0 as const)
      })
      .orElse((err) => {
        switch (err.data.msgCode) {
          case 65006:
            // 重复点赞
            return okAsync(0 as const)
          default:
            return errAsync(err)
        }
      })
  }

  /**
   * web 播放器信息
   */
  getWebPlayerInfo({
    bvid,
    cid,
    signal,
  }: {
    bvid: string
    cid: number
    signal?: AbortSignal
  }): ResultAsync<unknown, BilibiliApiError> {
    const params = getWbiEncodedParams({
      bvid,
      cid: String(cid),
    })
    return params.andThen((params) => {
      return bilibiliApiClient.get<unknown>({
        endpoint: '/x/player/wbi/v2',
        params,
        signal,
      })
    })
  }

  /**
   * 获取稍后再看视频列表
   */
  getToViewVideoList({ signal }: { signal?: AbortSignal } = {}): ResultAsync<
    unknown,
    BilibiliApiError
  > {
    return bilibiliApiClient.get<unknown>({
      endpoint: '/x/v2/history/toview',
      signal,
    })
  }

  /**
   * 删除稍后再看列表中的视频
   */
  deleteToViewVideo({
    deleteAllViewed,
    avid,
  }: {
    deleteAllViewed?: boolean
    avid?: number
  } = {}): ResultAsync<undefined, BilibiliApiError> {
    if (deleteAllViewed && avid) {
      return errAsync(
        new BilibiliApiError({
          message: '只能指定一个值',
          type: 'InvalidArgument',
        }),
      )
    }
    if (!deleteAllViewed && !avid) {
      return errAsync(
        new BilibiliApiError({
          message: '你没提供任何参数',
          type: 'InvalidArgument',
        }),
      )
    }
    const data: Record<string, string> = {}
    if (deleteAllViewed) {
      data.viewed = 'true'
    } else if (avid) {
      data.aid = avid.toString()
    }
    return bilibiliApiClient.postWithCsrf<undefined>({
      endpoint: '/x/v2/history/toview/del',
      payload: data,
    })
  }

  /**
   * 清除稍后再看列表中的所有视频
   */
  clearToViewVideoList(): ResultAsync<undefined, BilibiliApiError> {
    return bilibiliApiClient.postWithCsrf<undefined>({
      endpoint: '/x/v2/history/toview/clear',
    })
  }

  /**
   * 获取手机号登录所需的图形验证 token
   */
  getPhoneLoginCaptchaToken(): ResultAsync<
    BilibiliCaptchaTokenData,
    BilibiliApiError
  > {
    const reqFunction = async () => {
      const response = await fetch(
        `https://passport.bilibili.com/x/passport-login/captcha?source=main_web&t=${Date.now()}`,
        {
          method: 'GET',
          headers: {
            'User-Agent': PASSPORT_UA,
            Referer: 'https://www.bilibili.com/',
          },
          credentials: 'omit',
        },
      )
      if (!response.ok) {
        throw new BilibiliApiError({
          message: `获取验证码 token 失败: ${response.status} ${response.statusText}`,
          msgCode: response.status,
          type: 'RequestFailed',
        })
      }
      const data = (await response.json()) as {
        code: number
        message?: string
        data: BilibiliCaptchaTokenData
      }
      if (data.code !== 0) {
        throw new BilibiliApiError({
          message: `获取验证码 token 失败: ${data.message ?? data.code}`,
          msgCode: data.code,
          rawData: data,
          type: 'ResponseFailed',
        })
      }
      return data.data
    }

    return ResultAsync.fromPromise(reqFunction(), (error) => {
      if (error instanceof BilibiliApiError) return error
      return new BilibiliApiError({
        message: error instanceof Error ? error.message : String(error),
        msgCode: 0,
        rawData: null,
        type: 'ResponseFailed',
      })
    })
  }

  /**
   * 发送手机短信验证码
   */
  sendPhoneLoginSms({
    tel,
    cid,
    token,
    challenge,
    validate,
    seccode,
  }: {
    tel: string
    cid: string
    token: string
    challenge: string
    validate: string
    seccode: string
  }): ResultAsync<BilibiliSmsSendData, BilibiliApiError> {
    const reqFunction = async () => {
      const body = new URLSearchParams({
        cid,
        tel,
        source: 'main_mini_login',
        token,
        challenge,
        validate,
        seccode,
      }).toString()

      const response = await fetch(
        'https://passport.bilibili.com/x/passport-login/web/sms/send',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': PASSPORT_UA,
            Referer: 'https://www.bilibili.com/',
            Origin: 'https://www.bilibili.com',
          },
          body,
          credentials: 'omit',
        },
      )
      if (!response.ok) {
        throw new BilibiliApiError({
          message: `发送短信验证码失败: ${response.status} ${response.statusText}`,
          msgCode: response.status,
          type: 'RequestFailed',
        })
      }
      const data = (await response.json()) as {
        code: number
        message?: string
        data: BilibiliSmsSendData
      }
      if (data.code !== 0) {
        throw new BilibiliApiError({
          message: `发送短信验证码失败: ${data.message ?? data.code}`,
          msgCode: data.code,
          rawData: data,
          type: 'ResponseFailed',
        })
      }
      return data.data
    }

    return ResultAsync.fromPromise(reqFunction(), (error) => {
      if (error instanceof BilibiliApiError) return error
      return new BilibiliApiError({
        message: error instanceof Error ? error.message : String(error),
        msgCode: 0,
        rawData: null,
        type: 'ResponseFailed',
      })
    })
  }

  /**
   * 使用短信验证码登录
   * @returns 返回 Set-Cookie 字符串
   */
  loginWithPhoneSmsCode({
    tel,
    cid,
    code,
    captchaKey,
  }: {
    tel: string
    cid: string
    code: string
    captchaKey: string
  }): ResultAsync<string, BilibiliApiError> {
    const reqFunction = async () => {
      const body = new URLSearchParams({
        cid,
        tel,
        code,
        source: 'main_mini_login',
        captcha_key: captchaKey,
        keep: '1',
      }).toString()

      const response = await fetch(
        'https://passport.bilibili.com/x/passport-login/web/login/sms',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': PASSPORT_UA,
            Referer: 'https://www.bilibili.com/',
            Origin: 'https://www.bilibili.com',
          },
          body,
          credentials: 'omit',
        },
      )
      if (!response.ok) {
        throw new BilibiliApiError({
          message: `短信验证码登录失败: ${response.status} ${response.statusText}`,
          msgCode: response.status,
          type: 'RequestFailed',
          cause: undefined,
        })
      }
      const data = (await response.json()) as {
        code: number
        message?: string
        data: BilibiliSmsLoginData
      }
      if (data.code !== 0) {
        throw new BilibiliApiError({
          message: `短信验证码登录失败: ${data.message ?? data.code}`,
          msgCode: data.code,
          rawData: data,
          type: 'ResponseFailed',
        })
      }
      // Node fetch 适配：getSetCookie() 拿全部
      const setCookieList = response.headers.getSetCookie()
      if (!setCookieList || setCookieList.length === 0) {
        throw new BilibiliApiError({
          message: '登录成功但未获取到 Set-Cookie 头信息',
          msgCode: 0,
          rawData: null,
          type: 'ResponseFailed',
        })
      }
      return setCookieList.map((sc) => sc.split(';')[0]).join('; ')
    }

    return ResultAsync.fromPromise(reqFunction(), (error) => {
      if (error instanceof BilibiliApiError) return error
      return new BilibiliApiError({
        message: error instanceof Error ? error.message : String(error),
        msgCode: 0,
        rawData: null,
        type: 'ResponseFailed',
      })
    })
  }
}

export const bilibiliApi = new BilibiliApi()
