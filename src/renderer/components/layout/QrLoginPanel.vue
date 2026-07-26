<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import QRCode from 'qrcode'

import { Icons } from '../../utils/icons'
import MD3Button from '../common/MD3Button.vue'
import type { QrStatus } from '../../../shared/ipc-types'

// Bilibili 扫码登录面板
// 封装：状态机（generating/polling/scanned/success/expired/error）+ 主进程订阅 + 二维码图生成
// 对外：v-model:visible 控制显隐，@success 通知登录成功
// visible=true 自动启动申请+轮询，visible=false 自动取消轮询
interface Props {
  visible: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  'update:visible': [boolean]
  success: []
}>()

const qrStatus = ref<QrStatus>({ state: 'generating' })
const qrDataUrl = ref('')
let unsubQr: (() => void) | null = null

// visible 切换：true → 启动，false → 取消
watch(
  () => props.visible,
  (v) => {
    if (v) start()
    else cancel()
  },
)

// 状态变化：polling 生成二维码图；success 延迟通知父组件
watch(
  () => qrStatus.value,
  async (status) => {
    if (status.state === 'polling' && status.url) {
      try {
        qrDataUrl.value = await QRCode.toDataURL(status.url, {
          width: 200,
          margin: 1,
        })
      } catch (e) {
        console.error('生成二维码失败:', e)
      }
    } else if (status.state === 'success') {
      // 延迟 800ms 让用户看到 success 状态，再通知父组件关面板
      setTimeout(() => emit('success'), 800)
    }
  },
)

async function start() {
  qrStatus.value = { state: 'generating' }
  qrDataUrl.value = ''
  if (!unsubQr) {
    unsubQr = window.api.auth.onQrStatus((status) => {
      qrStatus.value = status
    })
  }
  await window.api.auth.loginWithQrCode()
}

function cancel() {
  void window.api.auth.cancelQrLogin()
}

function close() {
  emit('update:visible', false)
}

function refresh() {
  void start()
}

onUnmounted(() => {
  if (unsubQr) {
    unsubQr()
    unsubQr = null
  }
  cancel()
})
</script>

<template>
  <div
    v-if="visible"
    class="qr-panel"
  >
    <button
      type="button"
      class="qr-panel__close"
      @click="close"
    >
      <Icon
        :icon="Icons.close"
        :width="20"
        :height="20"
      />
    </button>

    <!-- generating / polling：显示二维码图 -->
    <div
      v-if="qrStatus.state === 'generating' || qrStatus.state === 'polling'"
      class="qr-panel__main"
    >
      <div class="qr-panel__image">
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="Bilibili 登录二维码"
          width="200"
          height="200"
        >
        <div
          v-else
          class="qr-panel__placeholder"
        >
          <Icon
            :icon="Icons.qrcodeScan"
            :width="48"
            :height="48"
          />
        </div>
      </div>
      <div class="qr-panel__hint">
        请使用 Bilibili 客户端扫码登录
      </div>
    </div>

    <!-- scanned：已扫码等待确认 -->
    <div
      v-else-if="qrStatus.state === 'scanned'"
      class="qr-panel__main"
    >
      <div class="qr-panel__status-icon qr-panel__status-icon--info">
        <Icon
          :icon="Icons.checkCircle"
          :width="48"
          :height="48"
        />
      </div>
      <div class="qr-panel__hint">
        已扫码，请在手机上确认登录
      </div>
    </div>

    <!-- success：登录成功 -->
    <div
      v-else-if="qrStatus.state === 'success'"
      class="qr-panel__main"
    >
      <div class="qr-panel__status-icon qr-panel__status-icon--success">
        <Icon
          :icon="Icons.checkCircle"
          :width="48"
          :height="48"
        />
      </div>
      <div class="qr-panel__hint">
        登录成功
      </div>
    </div>

    <!-- expired：二维码过期 -->
    <div
      v-else-if="qrStatus.state === 'expired'"
      class="qr-panel__main"
    >
      <div class="qr-panel__status-icon qr-panel__status-icon--warn">
        <Icon
          :icon="Icons.warning"
          :width="48"
          :height="48"
        />
      </div>
      <div class="qr-panel__hint">
        二维码已过期
      </div>
      <MD3Button
        variant="outlined"
        @click="refresh"
      >
        刷新二维码
      </MD3Button>
    </div>

    <!-- error -->
    <div
      v-else
      class="qr-panel__main"
    >
      <div class="qr-panel__status-icon qr-panel__status-icon--warn">
        <Icon
          :icon="Icons.warning"
          :width="48"
          :height="48"
        />
      </div>
      <div class="qr-panel__hint">
        {{ (qrStatus as { state: 'error'; message: string }).message || '发生错误' }}
      </div>
      <MD3Button
        variant="outlined"
        @click="refresh"
      >
        重试
      </MD3Button>
    </div>
  </div>
</template>

<style scoped>
/* ── 面板容器 ── */
.qr-panel {
  position: relative;
  width: 100%;
  max-width: 320px;
  background: var(--md-surface-container);
  border-radius: 16px;
  padding: 32px 24px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.qr-panel__close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--md-on-surface-variant);
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}
.qr-panel__close:hover {
  background: var(--md-surface-container-high);
}
.qr-panel__main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.qr-panel__image {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 8px;
}
.qr-panel__image img {
  display: block;
}
.qr-panel__placeholder {
  color: var(--md-on-surface-variant);
}
.qr-panel__hint {
  font-size: 14px;
  color: var(--md-on-surface-variant);
  text-align: center;
}
.qr-panel__status-icon {
  color: var(--md-primary);
}
.qr-panel__status-icon--success {
  color: var(--md-primary);
}
.qr-panel__status-icon--warn {
  color: var(--md-error);
}
.qr-panel__status-icon--info {
  color: var(--md-primary);
}
</style>
