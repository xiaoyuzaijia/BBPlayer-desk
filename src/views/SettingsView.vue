<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '../stores/theme'
import { usePlayerStore } from '../stores/player'
import { Icons } from '../utils/icons'
import MD3Slider from '../components/common/MD3Slider.vue'

const theme = useThemeStore()
const player = usePlayerStore()
const { volume } = storeToRefs(player)

// 主题模式标签映射
const modeLabels: Record<string, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
}

// 三态循环：light → system → dark → light
// 保留三态是因为 system 模式是 MD3 设置页常见的"自动"选项
function cycleMode() {
  const modes = ['light', 'system', 'dark'] as const
  const idx = modes.indexOf(theme.mode)
  theme.setMode(modes[(idx + 1) % modes.length])
}

// 当前主题图标：深色显示月亮，浅色/跟随系统显示太阳
const themeIcon = computed(() =>
  theme.mode === 'dark' ? Icons.darkMode : Icons.lightMode,
)

// 音量双向绑定：通过 computed setter 显式调用 store action
const volumeModel = computed({
  get: () => volume.value,
  set: (v: number) => player.setVolume(v),
})

// 关于分组数据
const aboutItems = [
  { label: '版本', value: '0.1.0', icon: Icons.info },
  { label: '开源许可', value: 'MIT', icon: Icons.security },
]
</script>

<template>
  <div class="settings">
    <h2 class="settings__title">设置</h2>

    <!-- ── 外观分组 ── -->
    <section class="group">
      <h3 class="group__title">外观</h3>
      <div class="group__list">
        <!-- 暗色模式：点击循环切换 light/system/dark -->
        <button
          type="button"
          class="row"
          @click="cycleMode()"
        >
          <div class="row__left">
            <Icon
              :icon="themeIcon"
              :width="20"
              :height="20"
              class="row__icon"
            />
            <span class="row__label">暗色模式</span>
          </div>
          <div class="row__right">
            <span class="row__value">{{ modeLabels[theme.mode] }}</span>
            <Icon
              :icon="Icons.chevronRight"
              :width="18"
              :height="18"
              class="row__chevron"
            />
          </div>
        </button>
      </div>
    </section>

    <!-- ── 播放分组 ── -->
    <section class="group">
      <h3 class="group__title">播放</h3>
      <div class="group__list">
        <!-- 默认音量：MD3Slider + 数值显示 -->
        <div class="row">
          <div class="row__left">
            <Icon
              :icon="Icons.volumeUp"
              :width="20"
              :height="20"
              class="row__icon"
            />
            <span class="row__label">默认音量</span>
          </div>
          <div class="row__right row__right--slider">
            <MD3Slider
              v-model="volumeModel"
              :max="100"
              class="row__slider"
            />
            <span class="row__value row__value--num">{{ volume }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── 关于分组 ── -->
    <section class="group">
      <h3 class="group__title">关于</h3>
      <div class="group__list">
        <div
          v-for="(item, idx) in aboutItems"
          :key="item.label"
          class="row"
          :class="{ 'row--divided': idx > 0 }"
        >
          <div class="row__left">
            <Icon
              :icon="item.icon"
              :width="20"
              :height="20"
              class="row__icon"
            />
            <span class="row__label">{{ item.label }}</span>
          </div>
          <div class="row__right">
            <span class="row__value">{{ item.value }}</span>
            <Icon
              :icon="Icons.chevronRight"
              :width="18"
              :height="18"
              class="row__chevron"
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ── 页面根容器 ── */
.settings {
  padding: 24px;
}
.settings__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--md-on-surface);
  margin-bottom: 24px;
}

/* ── 分组：标题 + 列表，分组间留 16px 间距 ── */
.group {
  margin-bottom: 16px;
}
.group:last-child {
  margin-bottom: 0;
}
/* 分组标题：label-large + tracking-wider + on-surface-variant */
.group__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--md-on-surface-variant);
  letter-spacing: 0.1em;
  padding: 0 16px;
  margin-bottom: 8px;
}
/* 列表容器：圆角 + 背景容器 */
.group__list {
  background: var(--md-surface-container);
  border-radius: 12px;
  overflow: hidden;
}

/* ── 列表行（按钮/容器通用） ── */
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 56px;
  padding: 0 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
  box-sizing: border-box;
  text-align: left;
}
.row:hover {
  background: var(--md-surface-container-high);
}
/* Divider：分组内第二项起顶部加分隔线 */
.row--divided {
  border-top: 1px solid var(--md-outline-variant);
}

.row__left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.row__icon {
  color: var(--md-on-surface-variant);
  flex-shrink: 0;
}
.row__label {
  font-size: 14px;
  color: var(--md-on-surface);
}

.row__right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
/* 音量行右侧：slider + 数值，更宽间距 */
.row__right--slider {
  gap: 12px;
}
.row__slider {
  width: 120px;
}
.row__value {
  font-size: 14px;
  color: var(--md-on-surface-variant);
}
/* 数值：等宽字体对齐，避免宽度跳动 */
.row__value--num {
  font-variant-numeric: tabular-nums;
  min-width: 28px;
  text-align: right;
}
.row__chevron {
  color: var(--md-on-surface-variant);
}
</style>
