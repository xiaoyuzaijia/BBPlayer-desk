<script setup lang="ts">
// 手动搜索歌词弹窗（参考 BBPlayer components/modals/lyrics/ManualSearchLyrics）
// 数据链路：网易云/酷狗按钮 → lyric:searchLyrics → 结果列表 → 点击结果 → lyric:fetchLyrics
//   （主进程写 userData/lyrics/{uniqueKey}.json）→ mutation onSuccess 失效歌词 query
//   → 播放页 useLyricsQuery 重新拉取 → 歌词自动换词 → 弹窗关闭
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'

import type {
  LyricSearchResultItem,
  LyricSearchSource,
} from '../../../shared/ipc-types'
import { useFetchLyricsMutation, useSearchLyricsMutation } from '../../composables/mutations/lyric'
import { useModalStore } from '../../stores/modal'
import { Icons } from '../../utils/icons'
import { formatTime } from '../../utils/format'
import IconButton from '../common/IconButton.vue'
import MD3Button from '../common/MD3Button.vue'
import type { ModalPropsMap } from '../../types/modal'

const props = defineProps<ModalPropsMap['ManualSearchLyrics']>()

const modalStore = useModalStore()

// 搜索关键词：初始为曲目名，可手动修改
const query = ref(props.initialQuery)

// 搜索 mutation：网易云 / 酷狗按钮分别触发（桌面端简化为显式按钮，替代 BBPlayer 的三源竞速）
const {
  mutate: search,
  isPending: isSearching,
  data: searchResults,
  error: searchError,
} = useSearchLyricsMutation()

// 应用结果 mutation：获取歌词写缓存，成功后由 composable 失效歌词 query
const {
  mutate: fetchLyrics,
  isPending: isFetching,
  error: fetchError,
} = useFetchLyricsMutation()

// 结果来源中文映射（BBPlayer 同款 SOURCE_MAP）
const SOURCE_MAP = {
  netease: '网易云',
  qqmusic: 'QQ 音乐',
  kugou: '酷狗',
} as const

// 点击搜索按钮；搜索中禁用，避免连点
function handleSearch(source: LyricSearchSource) {
  const keyword = query.value.trim()
  if (!keyword || isSearching.value || isFetching.value) return
  search({ source, keyword })
}

// 点击结果项：获取该曲歌词并写缓存，成功后关闭弹窗（BBPlayer 同款时序）
function handleSelect(item: LyricSearchResultItem) {
  if (isFetching.value) return
  fetchLyrics(
    { trackId: props.trackId, item },
    { onSuccess: () => modalStore.close('ManualSearchLyrics') },
  )
}

// 搜索 / 获取任一失败的提示文本（显示在列表区）
const errorMessage = computed(
  () => searchError.value?.message ?? fetchError.value?.message,
)
</script>

<template>
  <section
    class="search-modal"
    role="dialog"
    aria-label="手动搜索歌词"
  >
    <!-- 头部：标题 + 搜索中 spinner -->
    <header class="search-modal__header">
      <h2 class="search-modal__title">
        手动搜索歌词
      </h2>
      <Icon
        v-if="isSearching || isFetching"
        :icon="Icons.sync"
        :width="18"
        :height="18"
        class="search-modal__spinner"
      />
    </header>

    <!-- 右上角关闭按钮（与 Esc / 遮罩点击行为一致，fetch 进行中也可关闭） -->
    <IconButton
      :icon="Icons.close"
      :size="18"
      class="search-modal__close"
      @click="modalStore.close('ManualSearchLyrics')"
    />

    <!-- 搜索行：输入框 + 网易云 / 酷狗两个搜索按钮 -->
    <div class="search-modal__input-row">
      <input
        v-model="query"
        class="search-modal__input"
        placeholder="输入歌曲名"
        @keydown.enter="handleSearch('netease')"
      >
      <MD3Button
        variant="outlined"
        :icon="Icons.search"
        :disabled="isSearching || isFetching"
        @click="handleSearch('netease')"
      >
        网易云
      </MD3Button>
      <MD3Button
        variant="outlined"
        :icon="Icons.search"
        :disabled="isSearching || isFetching"
        @click="handleSearch('kugou')"
      >
        酷狗
      </MD3Button>
    </div>

    <!-- 结果区：四态（未搜索 / 搜索中 / 错误 / 列表与空态） -->
    <div class="search-modal__list">
      <div
        v-if="isSearching"
        class="search-modal__center"
      >
        <p class="search-modal__center-text">
          搜索中…
        </p>
      </div>
      <div
        v-else-if="errorMessage"
        class="search-modal__center"
      >
        <p class="search-modal__center-text search-modal__center-text--error">
          {{ errorMessage }}
        </p>
      </div>
      <div
        v-else-if="!searchResults"
        class="search-modal__center"
      >
        <p class="search-modal__center-text">
          输入关键词，点击上方按钮搜索
        </p>
      </div>
      <div
        v-else-if="searchResults.length === 0"
        class="search-modal__center"
      >
        <p class="search-modal__center-text">
          没有找到匹配的歌词
        </p>
      </div>
      <template v-else>
        <button
          v-for="item in searchResults"
          :key="`${item.source}-${item.remoteId}`"
          type="button"
          class="search-modal__item"
          :disabled="isFetching"
          @click="handleSelect(item)"
        >
          <span class="search-modal__item-title">{{ item.title }}</span>
          <span class="search-modal__item-sub">
            {{ item.artist }} - {{ formatTime(item.duration) }} -
            {{ SOURCE_MAP[item.source] }}
          </span>
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* ── 弹窗面板：MD3 dialog 表面（surface-container-high + 24px 圆角 + level3 阴影）── */
.search-modal {
  position: relative; /* 右上角关闭按钮的定位参照 */
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 480px;
  max-width: calc(100vw - 48px);
  padding: 24px;
  border-radius: var(--md-radius-lg);
  background: var(--md-surface-container-high);
  box-shadow: var(--md-elevation-shadow-level3);
  color: var(--md-on-surface);
}

/* 右上角关闭按钮（与 QrLoginModal 同款定位惯例） */
.search-modal__close {
  position: absolute;
  top: 8px;
  right: 8px;
}

.search-modal__header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.search-modal__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.search-modal__spinner {
  color: var(--md-primary);
  animation: search-modal-spin 1s linear infinite;
}
@keyframes search-modal-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 搜索行：输入框 + 两个源按钮 ── */
.search-modal__input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.search-modal__input {
  flex: 1;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--md-radius-sm);
  background: transparent;
  color: var(--md-on-surface);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease;
}
.search-modal__input::placeholder {
  color: var(--md-on-surface-variant);
}
.search-modal__input:focus {
  border-color: var(--md-primary);
}

/* ── 结果区：320px 滚动列表，各态居中文本 ── */
.search-modal__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  height: 320px;
  overflow-y: auto;
}
.search-modal__center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.search-modal__center-text {
  margin: 0;
  font-size: 14px;
  color: var(--md-on-surface-variant);
}
.search-modal__center-text--error {
  color: var(--md-error);
}
.search-modal__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  border: none;
  border-radius: var(--md-radius-md);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;
}
.search-modal__item:hover:not(:disabled) {
  background: color-mix(in srgb, var(--md-on-surface) 8%, transparent);
}
.search-modal__item:disabled {
  opacity: 0.5;
  cursor: default;
}
.search-modal__item-title {
  font-size: 14px;
  color: var(--md-on-surface);
}
.search-modal__item-sub {
  font-size: 12px;
  color: var(--md-on-surface-variant);
}
</style>
