<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Vue3Lottie } from 'vue3-lottie'
import { Icon } from '@iconify/vue'
import { usePlayerStore } from '../stores/player'
import { useThemeStore } from '../stores/theme'
import { Icons } from '../utils/icons'
import { formatTime } from '../utils/format'
import { tintLottieSource } from '../utils/lottie'
import IconButton from '../components/common/IconButton.vue'
import MD3Slider from '../components/common/MD3Slider.vue'
import CoverPlaceholder from '../components/common/CoverPlaceholder.vue'
// Lottie 帧定义：帧 0 = pause（双竖线），帧 7 = play（三角形）
// 初始化用 goToAndStop 直接定位，切换用 playSegments 播过渡
import playPauseJson from '../assets/lottie/play-pause.json'
import skipPrevJson from '../assets/lottie/skip-prev.json'
import skipNextJson from '../assets/lottie/skip-next.json'

const router = useRouter()
const player = usePlayerStore()
const theme = useThemeStore()
const { currentTrack, isPlaying, currentTime, hasPrev, hasNext, playMode } =
  storeToRefs(player)

// Lottie 染色：根据亮暗模式取对应硬编码颜色（与 style.css 中 --md-* 保持一致）
// light: primary=#6750a4, on-surface-variant=#49454f
// dark:  primary=#d0bcff, on-surface-variant=#cac4d0
const primaryColor = computed(() => (theme.isDark ? '#d0bcff' : '#6750a4'))
const onSurfaceVariantColor = computed(() =>
  theme.isDark ? '#cac4d0' : '#49454f',
)
// play-pause 用 primary 色，skip 按钮用 on-surface-variant 色
const tintedPlayPause = computed(() => tintLottieSource(playPauseJson, primaryColor.value))
const tintedSkipPrev = computed(() => tintLottieSource(skipPrevJson, onSurfaceVariantColor.value))
const tintedSkipNext = computed(() => tintLottieSource(skipNextJson, onSurfaceVariantColor.value))

// Lottie refs：用于调用 playSegments / setDirection / goToAndStop
const playPauseRef = ref<InstanceType<typeof Vue3Lottie> | null>(null)
const skipPrevRef = ref<InstanceType<typeof Vue3Lottie> | null>(null)
const skipNextRef = ref<InstanceType<typeof Vue3Lottie> | null>(null)

// 等 @onAnimationLoaded 触发后 lottie-web 实例才就绪，用 playPauseReady 保护
let playPauseReady = false

function initPlayPause() {
  const lottie = playPauseRef.value
  if (!lottie) return
  playPauseReady = true
  // 暂停→帧 7（三角形），播放→帧 0（双竖线）
  lottie.goToAndStop(isPlaying.value ? 0 : 7, true)
}

// playSegments 支持反向播放（from > to 时自动反转）
watch(isPlaying, (playing) => {
  const lottie = playPauseRef.value
  if (!lottie || !playPauseReady) return
  if (playing) {
    lottie.playSegments([8, 0], true) // 反向播放 帧7->0：三角形→双竖线
  } else {
    lottie.playSegments([0, 8], true) // 正向播放 帧0->7：双竖线→三角形
  }
})

// 切换播放/暂停
function togglePlay() {
  if (isPlaying.value) {
    player.pause()
  } else {
    player.resume()
  }
}

// 上一曲：播放 skip-prev Lottie 动画
function handlePrev() {
  if (!hasPrev.value) return
  skipPrevRef.value?.playSegments([0, 60], true)
  player.prev()
}

// 下一曲：播放 skip-next Lottie 动画
function handleNext() {
  if (!hasNext.value) return
  skipNextRef.value?.playSegments([0, 60], true)
  player.next()
}

// 进度条双向绑定：通过 computed setter 走 store action
const currentTimeModel = computed({
  get: () => currentTime.value,
  set: (v: number) => player.seek(v),
})

// 统一播放模式图标（与 NowPlayingBar 一致）：all → repeat / one → repeatOne / shuffle → shuffle
// 三态都为激活态，统一用 primary 色
const playModeIcon = computed(() => {
  switch (playMode.value) {
    case 'one':
      return Icons.repeatOne
    case 'shuffle':
      return Icons.shuffle
    default:
      return Icons.repeat
  }
})
</script>

<template>
  <div v-if="currentTrack" class="player">
    <!-- ── 顶栏：左返回 + 中标题 + 右更多 ── -->
    <header class="player__header">
      <IconButton
        :icon="Icons.chevronDown"
        :size="28"
        @click="router.back()"
      />
      <div class="player__title">
        <span class="player__status">正在播放</span>
        <span class="player__track-title">{{ currentTrack.title }}</span>
      </div>
      <IconButton :icon="Icons.more" :size="24" />
    </header>

    <!-- ── 主体：左侧控制台 / 右侧歌词占位 ── -->
    <div class="player__body">
      <!-- 左侧：封面区（封面 + 曲目信息）+ 控制台（进度+按钮） -->
      <section class="player__main">
        <!-- 封面区：封面 + 曲目信息，作为一个整体；封面可随窗口高度缩放 -->
        <div class="player__cover-wrap">
          <!-- 封面容器：用 aspect-ratio + flex 控制大小
             CoverPlaceholder 内部用固定 size，这里用 :deep() 覆盖让其填满父容器 -->
          <div class="player__cover">
            <CoverPlaceholder
              :title="currentTrack.title"
              :size="300"
              :cover-url="currentTrack.coverUrl"
            />
          </div>
          <!-- 曲目信息：与封面同宽对齐 -->
          <div class="track-info">
            <h1 class="track-info__title">{{ currentTrack.title }}</h1>
            <p class="track-info__artist">{{ currentTrack.artist }}</p>
          </div>
        </div>

        <!-- 控制台：进度条 + 主控制 + 副控制 -->
        <div class="player__console">
          <!-- 进度条 + 时间标签 -->
          <div class="progress">
            <MD3Slider
              v-model="currentTimeModel"
              :max="currentTrack.duration"
              class="progress__slider"
            />
            <div class="progress__time">
              <span class="progress__current">{{ formatTime(currentTime) }}</span>
              <span class="progress__duration">{{ formatTime(currentTrack.duration) }}</span>
            </div>
          </div>

          <!-- 主控制：skip-prev / play-pause / skip-next -->
          <div class="main-controls">
            <button
              type="button"
              class="skip-btn"
              :class="{ 'skip-btn--disabled': !hasPrev }"
              :disabled="!hasPrev"
              @click="handlePrev"
            >
              <Vue3Lottie
                ref="skipPrevRef"
                :animation-data="tintedSkipPrev"
                :auto-play="false"
                :loop="false"
                :speed="4"
                class="skip-btn__lottie"
              />
            </button>

            <button
              type="button"
              class="play-btn"
              @click="togglePlay"
            >
              <Vue3Lottie
                ref="playPauseRef"
                :animation-data="tintedPlayPause"
                :auto-play="false"
                :loop="false"
                :speed="2"
                class="play-btn__lottie"
                @onAnimationLoaded="initPlayPause"
              />
            </button>

            <button
              type="button"
              class="skip-btn"
              :class="{ 'skip-btn--disabled': !hasNext }"
              :disabled="!hasNext"
              @click="handleNext"
            >
              <Vue3Lottie
                ref="skipNextRef"
                :animation-data="tintedSkipNext"
                :auto-play="false"
                :loop="false"
                :speed="4"
                class="skip-btn__lottie"
              />
            </button>
          </div>

          <!-- 副控制：单一循环模式按钮（与 NowPlayingBar 一致）+ 列表按钮 -->
          <div class="sub-controls">
            <IconButton
              :icon="playModeIcon"
              :size="24"
              color="var(--md-primary)"
              @click="player.cyclePlayMode()"
            />
            <IconButton :icon="Icons.list" :size="24" />
          </div>
        </div>
      </section>

      <!-- 右侧：歌词区（暂用占位符，后续阶段实现） -->
      <aside class="player__lyrics">
        <div class="lyrics-placeholder">
          <div class="lyrics-placeholder__inner">
            <Icon
              :icon="Icons.lyrics"
              :width="64"
              :height="64"
              class="lyrics-placeholder__icon"
            />
            <p class="lyrics-placeholder__text">歌词面板（待实现）</p>
          </div>
        </div>
      </aside>
    </div>
  </div>

  <!-- 空状态：没有正在播放的曲目 -->
  <div v-else class="player-empty">
    <p class="player-empty__text">没有正在播放的曲目</p>
  </div>
</template>

<style scoped>
/* ── 页面根容器：占满高度 ── */
.player {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ── 顶栏：左返回 + 中标题 + 右更多 ── */
.player__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  flex-shrink: 0;
}
.player__title {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 40px;
  min-width: 0;
}
.player__status {
  font-size: 14px; /* titleMedium */
  font-weight: 500;
  color: var(--md-on-surface-variant);
  line-height: 1.2;
}
.player__track-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-on-surface);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* ── 主体：左右布局 ── */
.player__body {
  flex: 1;
  display: flex;
  min-height: 0;
  gap: 32px;
  padding: 6px 32px 32px;
}

/* ── 左侧主区：纵向布局（封面区在上，控制台在下） ── */
.player__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 40px;
  min-width: 0;
  min-height: 0;
  padding: 0 0 4px 0;
}

/* 封面区：封面 + 曲目信息作为一个整体
   flex: 1 让此区域占满可用高度，封面随窗口高度缩放 */
.player__cover-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  max-width: 360px;
  min-height: 0;
}

/* 封面容器：外层用 aspect-ratio + flex 控制尺寸，让封面能随窗口高度缩放
   CoverPlaceholder 内部用固定 size，这里用 :deep() 覆盖 width/height
   静态不旋转（与 BBPlayer 一致） */
.player__cover {
  width: 100%;
  max-width: 350px;
  /* aspect-ratio + max-height：在高度受限时让 width 由可用高度决定 */
  aspect-ratio: 1;
  max-height: 100%;
  position: relative;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23);
  border-radius: 66px; /* size*0.22 ≈ 300*0.22=66，与 CoverPlaceholder 默认圆角一致 */
  overflow: hidden;
}
/* 让 CoverPlaceholder 根元素填满 .player__cover 容器
   （覆盖其内部 style 的 width/height: 300px） */
.player__cover :deep(> *) {
  width: 100% !important;
  height: 100% !important;
}

/* 控制台：进度 + 主控制 + 副控制（曲目信息已移到封面区）
   固定高度，不随窗口缩放 */
.player__console {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

/* ── 曲目信息：与封面同宽，居中对齐 ── */
.track-info {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
  flex-shrink: 0;
}
.track-info__title {
  font-size: 22px; /* titleLarge */
  font-weight: 700;
  color: var(--md-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  min-width: 0;
}
.track-info__artist {
  font-size: 14px; /* bodyMedium */
  color: var(--md-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  min-width: 0;
}

/* ── 进度条 + 时间标签 ── */
.progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.progress__slider {
  width: 100%;
}
.progress__time {
  display: flex;
  justify-content: space-between;
  font-size: 12px; /* bodySmall */
  color: var(--md-on-surface-variant);
  font-variant-numeric: tabular-nums;
}

/* ── 主控制：skip-prev / play-pause / skip-next ── */
.main-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 40px;
}

/* skip 按钮：46×46 圆形（参考 BBPlayer skipButtonSize=46） */
.skip-btn {
  width: 46px;
  height: 46px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}
.skip-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--md-on-surface-variant) 8%, transparent);
}
.skip-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
.skip-btn__lottie {
  width: 100%;
  height: 100%;
}

/* play-pause 按钮：96×96 圆形（参考 BBPlayer playButtonSize=96）
   primary 色 Lottie 直接填充按钮 */
.play-btn {
  width: 96px;
  height: 96px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}
.play-btn:hover {
  background: color-mix(in srgb, var(--md-primary) 8%, transparent);
}
.play-btn__lottie {
  width: 100%;
  height: 100%;
}

/* ── 副控制：shuffle + repeat + queue ── */
.sub-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
}

/* ── 右侧歌词区：占位 ── */
.player__lyrics {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lyrics-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lyrics-placeholder__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.lyrics-placeholder__icon {
  color: var(--md-on-surface-variant);
  opacity: 0.3;
}
.lyrics-placeholder__text {
  font-size: 14px;
  color: var(--md-on-surface-variant);
  opacity: 0.6;
}

/* ── 空状态 ── */
.player-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.player-empty__text {
  font-size: 14px;
  color: var(--md-on-surface-variant);
}
</style>
