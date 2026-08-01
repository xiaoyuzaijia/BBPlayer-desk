<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'

import { Icons } from '../utils/icons'
import { resolveBilibiliImageUrl } from '../utils/imageUrl'
import IconButton from '../components/common/IconButton.vue'
import MD3Button from '../components/common/MD3Button.vue'
import MD3Switch from '../components/common/MD3Switch.vue'
import CoverPlaceholder from '../components/common/CoverPlaceholder.vue'
import QrLoginPanel from '../components/layout/QrLoginPanel.vue'
import { useAuthStore } from '../stores/auth'
import { useBilibiliUserInfo } from '../composables/queries/bilibili/user'

const router = useRouter()
const auth = useAuthStore()
const { isLoggedIn } = storeToRefs(auth)

// 返回上一页；无历史时回首页（避免直接打开 /account 时无处可退）
function goBack() {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'home' })
}

// ── 用户信息（已登录时由 TanStack Query 拉取）──
const { data: userInfo, isLoading: isUserInfoLoading, refetch: refetchUserInfo } = useBilibiliUserInfo()

// 显示用的用户信息：优先 Query 数据，回退 store 缓存（cachedAt 旧值）
const displayName = computed(() => userInfo.value?.name ?? auth.userInfo?.name ?? 'Bilibili 用户')
const displayMid = computed(() => userInfo.value?.mid ?? auth.userInfo?.mid ?? '')
// 头像 URL：B 站 CDN 图片走本地代理 server（绕过防盗链），异步转换
const displayFace = ref('')
watchEffect(async () => {
  const raw = userInfo.value?.face ?? auth.userInfo?.face ?? ''
  displayFace.value = (await resolveBilibiliImageUrl(raw, 200)) ?? ''
})

// 上报进度开关：当前为纯 UI 状态，未接 IPC
const sendPlayHistory = ref(true)

// ── 扫码登录面板显隐（面板内部自管状态机 + 订阅）──
const showQrPanel = ref(false)

function startQrLogin() {
  showQrPanel.value = true
}

function onQrSuccess() {
  // 登录成功：关面板；auth store 会通过 onStateChanged 自动更新 isLoggedIn
  showQrPanel.value = false
}

onMounted(() => {
  // 进入账号页：已登录则主动刷新一次用户信息（覆盖缓存）
  if (isLoggedIn.value) {
    void refetchUserInfo()
  }
})

async function logout() {
  await auth.logout()
}
</script>

<template>
  <div class="account">
    <!-- 顶部应用栏：返回按钮 + 标题 -->
    <header class="account__topbar">
      <IconButton
        :icon="Icons.chevronLeft"
        :size="24"
        @click="goBack"
      />
      <h2 class="account__title">
        Bilibili 账号
      </h2>
    </header>

    <!-- ─────────── 扫码面板（未登录/已登录下点扫码登录都显示） ─────────── -->
    <QrLoginPanel
      v-model:visible="showQrPanel"
      @success="onQrSuccess"
    />

    <!-- ─────────── 未登录态（默认 hero） ─────────── -->
    <div
      v-if="!showQrPanel && !isLoggedIn"
      class="account__hero"
    >
      <div class="account__default-avatar">
        <Icon
          :icon="Icons.person"
          :width="36"
          :height="36"
        />
      </div>
      <div class="account__hero-text">
        <h3 class="account__hero-title">
          连接 Bilibili
        </h3>
        <p class="account__hero-desc">
          登录后可同步收藏夹、稍后再看，并上报播放进度
        </p>
      </div>

      <!-- 登录方式按钮组 -->
      <div class="account__actions">
        <MD3Button
          variant="filled"
          :icon="Icons.qrcodeScan"
          @click="startQrLogin"
        >
          扫码登录
        </MD3Button>
        <MD3Button
          variant="outlined"
          :icon="Icons.phone"
          disabled
          title="下阶段实现"
        >
          手机号登录
        </MD3Button>
        <MD3Button
          variant="outlined"
          :icon="Icons.cookie"
          disabled
          title="下阶段实现"
        >
          导入 Cookie
        </MD3Button>
      </div>
    </div>

    <!-- ─────────── 已登录态 ─────────── -->
    <div
      v-else-if="!showQrPanel"
      class="account__logged"
    >
      <!-- 用户信息卡片 -->
      <div class="profile-card">
        <CoverPlaceholder
          :title="displayName"
          :size="72"
          :border-radius="36"
          :cover-url="displayFace"
          class="profile-card__avatar"
        />
        <div class="profile-card__text">
          <div class="profile-card__name">
            <template v-if="isUserInfoLoading">
              加载中…
            </template>
            <template v-else>
              {{ displayName }}
            </template>
          </div>
          <div class="profile-card__uid">
            <template v-if="displayMid">
              UID: {{ displayMid }}
            </template>
          </div>
        </div>
      </div>

      <!-- 设置区 -->
      <section class="group">
        <div class="group__list">
          <!-- 上报观看进度：当前为纯 UI 状态 -->
          <div class="row">
            <div class="row__left">
              <Icon
                :icon="Icons.history"
                :width="20"
                :height="20"
                class="row__icon"
              />
              <div class="row__text">
                <div class="row__label">
                  上报观看进度
                </div>
                <div class="row__sub">
                  关闭后不再向 B 站上报播放记录
                </div>
              </div>
            </div>
            <MD3Switch v-model="sendPlayHistory" />
          </div>

          <button
            type="button"
            class="row row--divided"
            @click="startQrLogin"
          >
            <div class="row__left">
              <Icon
                :icon="Icons.qrcodeScan"
                :width="20"
                :height="20"
                class="row__icon"
              />
              <span class="row__label">重新扫码登录</span>
            </div>
            <Icon
              :icon="Icons.chevronRight"
              :width="18"
              :height="18"
              class="row__chevron"
            />
          </button>

          <button
            type="button"
            class="row row--divided"
            disabled
            title="下阶段实现"
          >
            <div class="row__left">
              <Icon
                :icon="Icons.phone"
                :width="20"
                :height="20"
                class="row__icon"
              />
              <span class="row__label">手机号登录</span>
            </div>
            <Icon
              :icon="Icons.chevronRight"
              :width="18"
              :height="18"
              class="row__chevron"
            />
          </button>

          <button
            type="button"
            class="row row--divided"
            disabled
            title="下阶段实现"
          >
            <div class="row__left">
              <Icon
                :icon="Icons.cookie"
                :width="20"
                :height="20"
                class="row__icon"
              />
              <span class="row__label">修改 Cookie</span>
            </div>
            <Icon
              :icon="Icons.chevronRight"
              :width="18"
              :height="18"
              class="row__chevron"
            />
          </button>
        </div>
      </section>

      <!-- 退出登录按钮 -->
      <MD3Button
        variant="danger"
        :icon="Icons.logout"
        @click="logout"
      >
        退出 Bilibili 账号
      </MD3Button>
    </div>
  </div>
</template>

<style scoped>
/* ── 页面根容器 ── */
.account {
  padding: 16px 24px 24px;
}

/* ── 顶部应用栏 ── */
.account__topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}
.account__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--md-on-surface);
  margin: 0;
}

/* ────────── 未登录态 ────────── */
.account__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding-top: 24px;
}
.account__default-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--md-surface-variant);
  color: var(--md-on-surface-variant);
  display: flex;
  align-items: center;
  justify-content: center;
}
.account__hero-text {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.account__hero-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--md-on-surface);
  margin: 0;
}
.account__hero-desc {
  font-size: 14px;
  color: var(--md-on-surface-variant);
  margin: 0;
  line-height: 1.4;
}
.account__actions {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}
/* 按钮组内按钮撑满宽度 */
.account__actions :deep(.md3-btn) {
  width: 100%;
}

/* ────────── 已登录态 ────────── */
.account__logged {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 用户信息卡片 */
.profile-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--md-surface-variant);
  border-radius: 12px;
}
.profile-card__avatar {
  flex-shrink: 0;
}
.profile-card__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.profile-card__name {
  font-size: 20px;
  font-weight: 600;
  color: var(--md-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.profile-card__uid {
  font-size: 14px;
  color: var(--md-on-surface-variant);
}

/* ── 设置分组 ── */
.group__list {
  background: var(--md-surface-container);
  border-radius: 12px;
  overflow: hidden;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 56px;
  padding: 12px 16px;
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
.row:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.row--divided {
  border-top: 1px solid var(--md-outline-variant);
}
.row__left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
}
.row__icon {
  color: var(--md-on-surface-variant);
  flex-shrink: 0;
}
.row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.row__label {
  font-size: 14px;
  color: var(--md-on-surface);
}
.row__sub {
  font-size: 12px;
  color: var(--md-on-surface-variant);
  line-height: 1.3;
}
.row__chevron {
  color: var(--md-on-surface-variant);
  flex-shrink: 0;
}
</style>
