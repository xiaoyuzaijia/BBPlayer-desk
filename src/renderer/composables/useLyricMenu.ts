import { storeToRefs } from 'pinia'

import type { MenuItem } from '../types/menu'
import { useModalStore } from '../stores/modal'
import { usePlaybackStore } from '../stores/playback'
import { Icons } from '../utils/icons'

// 歌词页 more 菜单的菜单项生成（数据层）
// 对应 BBPlayer 的 usePlaylistMenu：hook 产数据（label / icon / onSelect / 语义标志），
// 呈现交给通用容器 MD3Menu，动作在 onSelect 里转发（弹窗 / 跳页），菜单本身不实现业务
export function useLyricMenu(): MenuItem[] {
  // 当前播放曲目：菜单动作的参数来源（对应 BBPlayer useCurrentTrack 模式）
  const playback = usePlaybackStore()
  const modalStore = useModalStore()
  const { currentTrack } = storeToRefs(playback)

  return [
    {
      label: '搜索歌词',
      icon: Icons.search,
      // 打开手动搜索歌词弹窗（初始关键词 = 当前曲目名）
      onSelect: () => {
        const track = currentTrack.value
        if (!track) return
        modalStore.open('ManualSearchLyrics', {
          trackId: track.id,
          initialQuery: track.title,
        })
      },
    },
  ]
}
