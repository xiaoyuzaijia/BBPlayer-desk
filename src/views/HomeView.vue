<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { Icons } from '../utils/icons'
import CoverPlaceholder from '../components/common/CoverPlaceholder.vue'

// 顶部搜索框 v-model（步骤 9：把静态 input 升级为受控输入）
const searchQuery = ref('')

// 时段问候：根据当前小时返回 "早上好 / 下午好 / 晚上好"
// 与 BBPlayer 顶部欢迎区一致，让首页有"会变"的拟真感
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了，听点轻音乐放松一下'
  if (h < 12) return '早上好，新的一天从音乐开始'
  if (h < 14) return '中午好，午休时来首歌'
  if (h < 18) return '下午好，继续专注工作'
  return '晚上好，今天辛苦了'
})

// 快捷卡片：每张配 48×48 圆形图标容器（primary-container 背景）
// 对应 BBPlayer 首页的快捷入口区域
const quickActions = [
  { title: '每日推荐', desc: '猜你喜欢', icon: Icons.fire },
  { title: '最近常听', desc: '重温好歌', icon: Icons.history },
  { title: '稍后再听', desc: '待播列表', icon: Icons.clock },
  { title: '历史记录', desc: '播放足迹', icon: Icons.trendingUp },
] as const

// 近期歌单：用 CoverPlaceholder 做封面
// 假数据，coverUrl 留空走占位符（演示占位符组件，符合步骤 9 验证目标）
const recentPlaylists = [
  { id: 'p1', title: '夜晚助眠电台', count: 32 },
  { id: 'p2', title: '日系燃向合集', count: 48 },
  { id: 'p3', title: '深夜emo歌单', count: 24 },
  { id: 'p4', title: '通勤路上必听', count: 56 },
  { id: 'p5', title: 'Vocaloid精选', count: 40 },
  { id: 'p6', title: '工作专注BGM', count: 18 },
] as const
</script>

<template>
  <div class="home">
    <!-- 顶部欢迎区：左侧 BBPlayer 标题 + 时段问候；右侧占位头像 -->
    <header class="home__header">
      <div>
        <h1 class="home__title">
          BBPlayer
        </h1>
        <p class="home__greeting">
          {{ greeting }}
        </p>
      </div>
      <!-- 占位头像：48×48 圆形 surface-variant，对应 BBPlayer 顶栏右侧 -->
      <div class="home__avatar">
        <Icon
          :icon="Icons.person"
          :width="24"
          :height="24"
        />
      </div>
    </header>

    <!-- 搜索栏：左侧放大镜 + v-model 受控，圆角全圆，背景 surface-variant -->
    <div class="search">
      <Icon
        :icon="Icons.search"
        :width="20"
        :height="20"
        class="search__icon"
      />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索歌曲、UP主..."
        class="search__input"
      >
    </div>

    <!-- 快捷卡片：响应式 grid（2/3/4 列），每张左侧 48×48 圆形图标容器 -->
    <section>
      <h2 class="section-title">
        快捷入口
      </h2>
      <!-- 列数与触发宽度由 .quick-grid 的 @media 控制（见 <style>） -->
      <div class="quick-grid">
        <div
          v-for="item in quickActions"
          :key="item.title"
          class="quick-card"
        >
          <!-- 48×48 圆形图标容器：primary-container 背景 + on-primary-container 图标 -->
          <div class="quick-card__icon">
            <Icon
              :icon="item.icon"
              :width="24"
              :height="24"
            />
          </div>
          <div class="quick-card__text">
            <div class="quick-card__title">
              {{ item.title }}
            </div>
            <div class="quick-card__desc">
              {{ item.desc }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 近期歌单：响应式 grid（2/3/4/6 列），CoverPlaceholder 做封面 -->
    <section>
      <h2 class="section-title">
        近期歌单
      </h2>
      <!-- 列数与触发宽度由 .playlist-grid 的 @media 控制（见 <style>） -->
      <div class="playlist-grid">
        <div
          v-for="pl in recentPlaylists"
          :key="pl.id"
          class="playlist-card"
        >
          <!-- 封面：CoverPlaceholder 渐变 + 首字母，固定 150 尺寸居中显示 -->
          <CoverPlaceholder
            :title="pl.title"
            :size="150"
            class="playlist-card__cover"
          />
          <!-- 底部信息：标题 + 数量，整体居中 -->
          <div class="playlist-card__meta">
            <div class="playlist-card__title">
              {{ pl.title }}
            </div>
            <div class="playlist-card__count">
              {{ pl.count }} 首
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ── 页面根容器：padding + 垂直间距 ── */
.home {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 32px; /* space-y-8 */
}

/* ── 顶部欢迎区 ── */
.home__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.home__title {
  font-size: 28px;
  font-weight: 700;
  color: var(--md-on-surface);
  line-height: 1.1;
}
.home__greeting {
  font-size: 14px;
  color: var(--md-on-surface-variant);
  margin-top: 4px;
}
.home__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--md-surface-variant);
  color: var(--md-on-surface-variant);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── 搜索栏 ── */
.search {
  position: relative;
}
.search__icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--md-on-surface-variant);
  pointer-events: none;
}
.search__input {
  width: 100%;
  height: 48px;
  padding: 0 20px 0 48px;
  background: var(--md-surface-variant);
  color: var(--md-on-surface);
  border-radius: 9999px;
  border: none;
  outline: none;
  font-size: 14px;
  transition: background-color 0.15s ease;
}
.search__input::placeholder {
  color: var(--md-on-surface-variant);
}
.search__input:focus {
  background: var(--md-surface-container-high);
}

/* ── 区段标题（两个 section 共用） ── */
.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--md-on-surface);
  margin-bottom: 12px;
}

/* ── 快捷卡片 grid：默认 2 列，≥640px 3 列，≥768px 4 列 ──
   要调整 grid 触发宽度，改下面 @media 的 min-width 值即可 */
.quick-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (min-width: 640px) {
  .quick-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 768px) {
  .quick-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* ── 快捷卡片本体 ── */
.quick-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--md-surface-container);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.quick-card:hover {
  background: var(--md-surface-container-high);
}
.quick-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--md-primary);
  color: var(--md-on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.quick-card__text {
  min-width: 0;
}
.quick-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--md-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.quick-card__desc {
  font-size: 12px;
  color: var(--md-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 近期歌单 grid：默认 2 列，≥640px 3 列，≥768px 4 列，≥1024px 6 列 ──
   要调整 grid 触发宽度，改下面 @media 的 min-width 值即可 */
.playlist-grid {
  display: grid;
  /* 横向 12px 间距；纵向 40px 给封面溢出 30px + 10px 余量，避免行间重叠 */
  column-gap: 12px;
  row-gap: 40px;
  /* 顶部留 30px 给首行封面溢出（封面 top: -30px） */
  padding-top: 30px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (min-width: 640px) {
  .playlist-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 768px) {
  .playlist-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (min-width: 1024px) {
  .playlist-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

/* ── 歌单卡片本体：容器与封面同宽同圆角，封面上半部分溢出覆盖容器顶部 ── */
.playlist-card {
  position: relative;
  /* 与封面同宽（150px），列内居中 */
  width: 150px;
  justify-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  background: var(--md-surface-container);
  /* 与封面圆角一致（CoverPlaceholder 默认 size * 0.22 = 33px） */
  border-radius: 33px;
  /* 顶部 padding 留 120px 给封面区域（封面 150 - 溢出 30 = 容器内 120） */
  padding: 12px 12px 12px 12px;
  padding-top: 120px;
  transition: background-color 0.15s ease;
}
.playlist-card:hover {
  background: var(--md-surface-container-high);
}
/* 封面：absolute 顶部溢出 30px，居中，加阴影显示浮在容器上 */
.playlist-card__cover {
  position: absolute;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  /* MD3 level-1 阴影近似：柔和投影，强化"浮"的视觉 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: opacity 0.15s ease;
}
.playlist-card:hover .playlist-card__cover {
  opacity: 0.9;
}
/* 底部信息容器：标题 + 数量，居中显示 */
.playlist-card__meta {
  width: 100%;
  text-align: center;
}
.playlist-card__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.playlist-card__count {
  font-size: 12px;
  color: var(--md-on-surface-variant);
  margin-top: 2px;
}
</style>
