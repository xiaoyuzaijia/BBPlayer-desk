<script setup lang="ts">
// 全局弹窗宿主（参考 BBPlayer app/modal.tsx 的 ModalHost）
// - 渲染 modal store 的弹窗栈，每层自带遮罩，z-index 随栈深度递增
// - 遮罩点击关闭该层；Esc 关闭栈顶
// - 与 BBPlayer 的差异：桌面端无系统返回手势，去掉路由挂载与 preventRemove
import { useEventListener } from '@vueuse/core'

import { useModalStore } from '../../stores/modal'
import { modalRegistry } from './registry'

const modalStore = useModalStore()

// Esc 关闭栈顶弹窗
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    modalStore.closeTop()
  }
})
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="modal">
      <div
        v-for="(modal, idx) in modalStore.modals"
        :key="modal.key"
        class="modal-host__overlay"
        :style="{ zIndex: 100 + idx * 10 }"
        @click="modalStore.close(modal.key)"
      >
        <!-- 弹窗面板：点击面板不冒泡到遮罩 -->
        <component
          :is="modalRegistry[modal.key]"
          v-bind="modal.props"
          @click.stop
        />
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
/* 遮罩：全屏 + scrim 50%（MD3 dialog 规范） */
.modal-host__overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--md-scrim) 50%, transparent);
}

/* ── 进入/退出动画：遮罩淡入淡出 + 面板轻微上浮 ── */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active > *,
.modal-leave-active > * {
  transition: transform 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from > *,
.modal-leave-to > * {
  transform: translateY(8px);
}
</style>
