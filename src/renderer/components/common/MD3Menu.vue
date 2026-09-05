<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { onClickOutside, useEventListener } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import type { MenuItem } from '../../types/menu'

// MD3 下拉菜单容器（呈现层）：只负责渲染 items 与浮层行为，动作由 item.onSelect 承载
// 组件契约与 QueueDrawer 一致：自身不持有开关状态，由父组件 v-if 控制挂载 + 传 trigger 元素
interface Props {
  items: MenuItem[]
  /** 触发按钮元素：定位锚点 + onClickOutside 忽略，避免与 trigger 自身的 toggle 冲突 */
  trigger: HTMLElement | null
  /** 水平对齐：end = 右对齐（适配右上角 more 按钮），start = 左对齐 */
  placement?: 'bottom-start' | 'bottom-end'
}

const props = withDefaults(defineProps<Props>(), {
  placement: 'bottom-end',
})

const emit = defineEmits<{
  close: []
}>()

const rootRef = ref<HTMLElement | null>(null)

// fixed 定位坐标（挂载后从 trigger 位置计算）；null 期间隐藏避免闪位
const pos = ref<{ top: number; left: number } | null>(null)
// 垂直方向：下方空间不足时翻转到 trigger 上方，过渡动画随之切换
const openUpward = ref(false)

// 菜单与 trigger 的间距
const GAP = 4

onMounted(async () => {
  // 等 DOM 插入完成才能量到菜单实际尺寸（nextTick 是微任务，绘制前完成，无闪位）
  await nextTick()
  const trigger = props.trigger
  const menu = rootRef.value
  if (!trigger || !menu) return
  const rect = trigger.getBoundingClientRect()
  const menuHeight = menu.offsetHeight
  // 垂直：默认放 trigger 下方；下方放不下且上方够放则翻转
  openUpward.value =
    rect.bottom + GAP + menuHeight > window.innerHeight &&
    rect.top - GAP - menuHeight >= 0
  pos.value = {
    top: openUpward.value ? rect.top - GAP - menuHeight : rect.bottom + GAP,
    left:
      props.placement === 'bottom-end'
        ? rect.right - menu.offsetWidth
        : rect.left,
  }
})

// 点击外部关闭（ignore 接受整个数组的 getter —— 整组传 trigger，避免与 toggle 冲突）
onClickOutside(rootRef, () => emit('close'), {
  ignore: () => [props.trigger],
})

// Esc 关闭
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    emit('close')
  }
})

// 点击菜单项：先关菜单再执行动作（对应 BBPlayer PlayerFunctionalMenu 的 handleAction 顺序）
function handleItemClick(item: MenuItem) {
  if (item.disabled) return
  emit('close')
  item.onSelect?.()
}
</script>

<template>
  <!-- 传送 body：fixed 定位 + 规避祖先 transform 影响（NPB 已知陷阱） -->
  <Teleport to="body">
    <Transition :name="openUpward ? 'menu-up' : 'menu-down'">
      <div
        ref="rootRef"
        class="menu"
        role="menu"
        :style="pos ? { top: pos.top + 'px', left: pos.left + 'px' } : { visibility: 'hidden' }"
      >
        <button
          v-for="item in items"
          :key="item.label"
          type="button"
          role="menuitem"
          class="menu__item"
          :class="{
            'menu__item--danger': item.danger,
            'menu__item--disabled': item.disabled,
          }"
          :disabled="item.disabled"
          @click="handleItemClick(item)"
        >
          <Icon
            v-if="item.icon"
            :icon="item.icon"
            :width="20"
            :height="20"
            class="menu__item-icon"
          />
          <span class="menu__item-label">{{ item.label }}</span>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── 菜单容器：fixed 定位，坐标由脚本在挂载后计算 ── */
.menu {
  position: fixed;
  min-width: 180px;
  max-width: 280px;
  padding: 8px;
  background: var(--md-surface-container);
  border-radius: var(--md-radius-sm); /* MD3 menu 容器圆角 */
  box-shadow: var(--md-elevation-shadow-level2); /* menu 规范为 level2 */
  z-index: 60;
}

/* ── 菜单项：高 48（MD3 规范），14px 文字 + 20px 图标 ── */
.menu__item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 48px;
  padding: 0 12px;
  border: none;
  border-radius: var(--md-radius-sm);
  background: transparent;
  cursor: pointer;
  font-size: 14px; /* bodyMedium */
  color: var(--md-on-surface);
  text-align: left;
  transition: background-color 0.15s ease;
}
/* hover：on-surface 8% state layer */
.menu__item:hover:not(:disabled) {
  background: color-mix(in srgb, var(--md-on-surface) 8%, transparent);
}
.menu__item--disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
.menu__item-icon {
  color: var(--md-on-surface-variant);
  flex-shrink: 0;
}
/* danger 项：整项染 error 色（对应 BBPlayer 菜单的 destructive） */
.menu__item--danger,
.menu__item--danger .menu__item-icon {
  color: var(--md-error);
}

/* ── 进入/退出动画：下方弹出从 -4px 落下，上方弹出从 +4px 升起 ── */
.menu-down-enter-active,
.menu-down-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.menu-down-enter-from,
.menu-down-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.menu-up-enter-active,
.menu-up-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.menu-up-enter-from,
.menu-up-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
