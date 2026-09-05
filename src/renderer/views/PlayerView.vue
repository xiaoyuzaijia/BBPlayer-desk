<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useResizeObserver } from '@vueuse/core'
import { Vue3Lottie } from 'vue3-lottie'
import { usePlaybackStore } from '../stores/playback'
import { useThemeStore } from '../stores/theme'
import { Icons } from '../utils/icons'
import { tintLottieSource } from '../utils/lottie'
import IconButton from '../components/common/IconButton.vue'
import PlayerProgressBar from '../components/player/PlayerProgressBar.vue'
import CoverPlaceholder from '../components/common/CoverPlaceholder.vue'
import QueueDrawer from '../components/player/QueueDrawer.vue'
import LyricView from '../components/lyric/LyricView.vue'
import MD3Menu from '../components/common/MD3Menu.vue'
import { useLyricMenu } from '../composables/useLyricMenu'
// Lottie 帧定义：帧 0 = pause（双竖线），帧 7 = play（三角形）
// 初始化用 goToAndStop 直接定位，切换用 playSegments 播过渡
import playPauseJson from '../assets/lottie/play-pause.json'
import skipPrevJson from '../assets/lottie/skip-prev.json'
import skipNextJson from '../assets/lottie/skip-next.json'

const router = useRouter()
// PlayerView 用 playback store 拿控制状态 + 控制动作
const playback = usePlaybackStore()
const theme = useThemeStore()
// 进度条用 smoothCurrentTime（60fps rAF 平滑插值），而非 currentTime（4Hz timeupdate 卡顿）
const { currentTrack, isPlaying, smoothCurrentTime, hasPrev, hasNext, playMode } =
  storeToRefs(playback)

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
    playback.pause()
  } else {
    playback.resume()
  }
}

// 上一曲：播放 skip-prev Lottie 动画
function handlePrev() {
  if (!hasPrev.value) return
  skipPrevRef.value?.playSegments([0, 60], true)
  playback.prev()
}

// 下一曲：播放 skip-next Lottie 动画
function handleNext() {
  if (!hasNext.value) return
  skipNextRef.value?.playSegments([0, 60], true)
  playback.next()
}

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

// 队列抽屉开关 + trigger 元素引用（用于 onClickOutside 忽略）
const queueOpen = ref(false)
const queueTriggerEl = ref<HTMLElement | null>(null)

// 控制台元素引用 + 宽度（用于 inline 抽屉宽度对齐控制台）
const consoleEl = ref<HTMLElement | null>(null)
const consoleWidth = ref(0)
useResizeObserver(consoleEl, ([entry]) => {
  consoleWidth.value = entry.contentRect.width
})
watch(queueOpen, (open) => {
  if (open && consoleEl.value && consoleWidth.value === 0) {
    consoleWidth.value = consoleEl.value.offsetWidth
  }
})

// 歌词页 more 菜单：开关状态 + trigger 元素引用（与队列抽屉同一模式）
const moreOpen = ref(false)
const moreTriggerEl = ref<HTMLElement | null>(null)
// 菜单项由数据层 composable 生成（对应 BBPlayer 的 usePlaylistMenu）
const lyricMenuItems = useLyricMenu()
</script>

<template>
  <div
    v-if="currentTrack"
    class="player"
  >
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
      <div
        ref="moreTriggerEl"
        class="player__more-trigger"
      >
        <IconButton
          :icon="Icons.more"
          :size="24"
          :selected="moreOpen"
          @click="moreOpen = !moreOpen"
        />
      </div>
    </header>

    <!-- 歌词页 more 菜单：内部 Teleport 到 body，此处位置随意 -->
    <MD3Menu
      v-if="moreOpen"
      :trigger="moreTriggerEl"
      :items="lyricMenuItems"
      @close="moreOpen = false"
    />

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
              :cover-url="currentTrack.coverUrl ?? undefined"
              high-res
            />
          </div>
          <!-- 曲目信息：与封面同宽对齐 -->
          <div class="track-info">
            <h1 class="track-info__title">
              {{ currentTrack.title }}
            </h1>
            <p class="track-info__artist">
              {{ currentTrack.artist?.name ?? '未知' }}
            </p>
          </div>
        </div>

        <!-- 控制台：进度条 + 主控制 + 副控制
            ref + position: relative 作为 inline 队列抽屉的定位参照 -->
        <div
          ref="consoleEl"
          class="player__console"
        >
          <!-- 进度条 + 时间标签（自绘滑块，scrub 预览与 seek 分离） -->
          <PlayerProgressBar
            :current="smoothCurrentTime"
            :duration="currentTrack.duration"
            @seek="playback.seek"
          />

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
                @on-animation-loaded="initPlayPause"
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

          <!-- 副控制：单一循环模式按钮（与 NowPlayingBar 一致）+ 列表按钮
              列表按钮作为队列抽屉 trigger
              抽屉作为 sub-controls 子元素，bottom 相对 sub-controls 顶部往上，
              水平居中仍对齐控制台（sub-controls 宽度 = 控制台宽度，因 flex stretch） -->
          <div class="sub-controls">
            <IconButton
              :icon="playModeIcon"
              :size="24"
              color="var(--md-primary)"
              @click="playback.cyclePlayMode()"
            />
            <div
              ref="queueTriggerEl"
              class="sub-controls__queue-trigger"
            >
              <IconButton
                :icon="Icons.list"
                :size="24"
                :selected="queueOpen"
                @click="queueOpen = !queueOpen"
              />
            </div>

            <!-- 队列抽屉：inline variant，接着列表按钮这一行往上 -->
            <QueueDrawer
              v-if="queueOpen"
              variant="inline"
              :trigger="queueTriggerEl"
              :width="consoleWidth"
              @close="queueOpen = false"
            />
          </div>
        </div>
      </section>

      <!-- 右侧：歌词区（LyricView 内部处理空态占位） -->
      <aside class="player__lyrics">
        <LyricView />
      </aside>
    </div>
  </div>

  <!-- 空状态：没有正在播放的曲目 -->
  <div
    v-else
    class="player-empty"
  >
    <p class="player-empty__text">
      没有正在播放的曲目
    </p>
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
/* more 菜单 trigger 容器：组件 ref 拿不到根 DOM，与队列 trigger 一致包一层 */
.player__more-trigger {
  display: inline-flex;
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

/* ── 副控制：shuffle + repeat + queue ──
   position: relative 作为 inline 队列抽屉的定位参照
   （让抽屉 bottom 相对 sub-controls 顶部往上，而非控制台顶部） */
.sub-controls {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
}
/* 队列按钮 trigger 容器 */
.sub-controls__queue-trigger {
  display: inline-flex;
}

/* ── 右侧歌词区：让 LyricView 占满 ── */
.player__lyrics {
  flex: 1;
  min-width: 0;
  display: flex;
  /* LyricView 内部自管滚动 + 居中，外层只需给高度 */
  overflow: hidden;
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
