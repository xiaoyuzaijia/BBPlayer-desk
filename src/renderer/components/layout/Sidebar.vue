<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { Icons } from '../../utils/icons'

// 导航项配置：name 对应路由名，icon 用 Icons 常量统一管理
const navItems = [
  { name: 'home', label: '首页', icon: Icons.home },
  { name: 'library', label: '音乐库', icon: Icons.library },
  { name: 'settings', label: '设置', icon: Icons.settings },
] as const

// 抽拉状态：本地 ref，不进 store（只影响布局，无需跨组件同步）
const collapsed = ref(false)
function toggleCollapsed() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <nav
    class="sidebar-elevated"
    :class="collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'"
  >
    <!-- Logo 区：展开态显示标题文字 + 抽拉按钮；收起态只剩抽拉按钮。
         RouterLink 整体回首页，抽拉按钮 @click.prevent 阻止冒泡与默认跳转 -->
    <RouterLink
      :to="{ name: 'home' }"
      class="logo-elevated logo-row"
      :class="collapsed ? 'logo-row--collapsed' : 'logo-row--expanded'"
    >
      <span
        v-if="!collapsed"
        class="logo-text"
      >BBPlayer</span>
      <button
        type="button"
        class="toggle-btn"
        :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
        @click.prevent="toggleCollapsed"
      >
        <!-- 用两个图标切换：收起态 chevronRight（朝右，可展开），
             展开态 chevronLeft（朝左，可收起） -->
        <Icon
          :icon="collapsed ? Icons.chevronRight : Icons.chevronLeft"
          :width="32"
          :height="32"
        />
      </button>
    </RouterLink>

    <!-- 导航项：收起态隐藏 label、图标居中。点击导航不展开（只切换路由） -->
    <RouterLink
      v-for="item in navItems"
      :key="item.name"
      :to="{ name: item.name }"
      class="nav-item group"
      :class="collapsed ? 'nav-item--collapsed' : ''"
      active-class="nav-item--active"
      :title="collapsed ? item.label : undefined"
    >
      <Icon
        :icon="item.icon"
        :width="24"
        :height="24"
        class="transition-transform group-hover:scale-110 group-[.nav-item--active]:scale-110"
      />
      <span v-if="!collapsed">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
/* MD3 NavigationDrawer 用 elevation level2 阴影与主区域分界，
   取代 border-r（MD3 规范推荐用阴影而非描边表达层级） */
.sidebar-elevated {
  flex-shrink: 0;
  height: 100vh;
  background: var(--md-surface-container);
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 阴影绘制在右侧主区域之上，避免被 main 容器遮挡 */
  position: relative;
  z-index: 1;
  box-shadow: var(--md-elevation-shadow-level2);
  /* 宽度过渡，配合 collapsed 切换 */
  transition: width 0.2s ease;
  overflow: hidden;
}

/* 展开态：220px */
.sidebar-expanded {
  width: 220px;
}

/* 收起态：72px（容纳图标 + 12px 左右边距） */
.sidebar-collapsed {
  width: 80px;
}

/* Logo 块阴影 */
.logo-elevated {
  position: relative;
  z-index: 2;
  box-shadow: var(--md-elevation-shadow-level1);
}

/* Logo 行：flex 布局，展开时文字 + 按钮，收起时只剩按钮居中 */
.logo-row {
  display: flex;
  align-items: center;
  text-decoration: none;
  padding: 20px 12px;
  margin-bottom: 4px;
  background: var(--md-primary-container);
}

.logo-row--expanded {
  /* 文字左对齐 + 按钮靠右 */
  justify-content: center;
  gap: 8px;
  position: relative;
}

.logo-row--collapsed {
  /* 收起态按钮居中 */
  justify-content: center;
  /* 收起态按钮在正常流中（不再 absolute），减小垂直 padding
     使总高度与展开态（约 64px）一致：48px(按钮) + 8px*2 = 64px */
  padding: 8px 12px;
}

/* 标题文字 */
.logo-text {
  font-size: 24px;
  font-weight: 700;
  color: var(--md-primary);
  line-height: 1;
}

/* 抽拉按钮：MD3 IconButton 风格，48×48 触控区，hover state-layer */
.toggle-btn {
  width: 48px;
  height: 48px;
  border: none;
  background: transparent;
  color: var(--md-primary);
  cursor: pointer;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}
.toggle-btn:hover {
  background: color-mix(in srgb, var(--md-primary) 8%, transparent);
}
.toggle-btn:active {
  background: color-mix(in srgb, var(--md-primary) 12%, transparent);
}

/* 展开态：标题文字居中时按钮绝对定位到右侧 */
.logo-row--expanded .toggle-btn {
  position: absolute;
  right: 8px;
}

/* MD3 NavigationDrawer 激活态是 pill 形，高度 56px */
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 12px;
  height: 56px;
  padding: 0 20px;
  border-radius: 9999px;
  color: var(--md-on-surface-variant);
  text-decoration: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}

/* 收起态导航项：padding 减小让图标居中，pill 形宽度自适应 */
.nav-item--collapsed {
  padding: 0;
  justify-content: center;
}

/* state-layer：hover 8% on-surface（MD3 规范），hover 时字重变粗 */
.nav-item:hover:not(.nav-item--active) {
  background: color-mix(in srgb, var(--md-on-surface) 8%, transparent);
  font-weight: 600;
}

/* 激活态：primary-container 背景 + primary 文字 + 持续粗体 */
.nav-item--active {
  background: var(--md-primary-container);
  color: var(--md-primary);
  font-weight: 600;
}
</style>
