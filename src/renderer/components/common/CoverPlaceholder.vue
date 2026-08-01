<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useThemeStore } from '../../stores/theme'
import { resolveBilibiliImageUrl } from '../../utils/imageUrl'

// 封面占位符 Props
// 参考 BBPlayer CoverWithPlaceHolder.tsx：标题 hash → HSL 渐变 + 首字母
interface Props {
  // 用于生成首字母与 hash 的标题（trim 后为空则用 'default' 兜底）
  title: string
  // 封面尺寸（宽高相同，px）
  size: number
  // 圆角，默认 size * 0.22（MD3 超椭圆近似比例）
  borderRadius?: number
  // 真实封面 URL，存在则覆盖在占位符之上
  // B 站 CDN URL 会自动走本地 imageProxy（绕防盗链）；非 B 站 / 已是代理 URL 原样使用
  coverUrl?: string
}

const props = defineProps<Props>()

// 主题 store 用于取 isDark 调整渐变饱和度/亮度
const theme = useThemeStore()

// ── 移植自 BBPlayer apps/mobile/src/utils/color.ts ──
interface RGBColor {
  r: number
  g: number
  b: number
}

function hslToRgb(h: number, s: number, l: number): RGBColor {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  if (s === 0) {
    return { r: l * 255, g: l * 255, b: l * 255 }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hNorm = h / 360
  return {
    r: Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hNorm) * 255),
    b: Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
  }
}

// 字符串 → 32 位整数 hash（BBPlayer stringToHashCode）
function stringToHash(str: string): number {
  let hash = 0
  if (str.length === 0) return hash
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return hash
}

// 基于标题 + 暗色态生成两色渐变（与 BBPlayer getGradientColors 一致）
const gradient = computed(() => {
  const validTitle = props.title.trim() || 'default'
  const isDark = theme.isDark
  const sat = isDark ? 0.55 : 0.7
  const l1 = isDark ? 0.4 : 0.65
  const l2 = isDark ? 0.35 : 0.6
  const hash = stringToHash(validTitle)
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 40) % 360
  const c1 = hslToRgb(h1, sat, l1)
  const c2 = hslToRgb(h2, sat, l2)
  return {
    color1: `rgba(${c1.r}, ${c1.g}, ${c1.b}, 1)`,
    color2: `rgba(${c2.r}, ${c2.g}, ${c2.b}, 1)`,
  }
})

// 首字母：用 Array.from 处理代理对（中日韩字符已足够，emoj ZWJ 序列可能拆分）
const firstChar = computed(() => {
  const t = props.title.trim()
  return t ? Array.from(t)[0].toUpperCase() : ''
})

const radius = computed(() => props.borderRadius ?? props.size * 0.22)

// B 站 CDN 封面统一走 imageProxy：异步把 coverUrl 解析为代理 URL
// - 传入原始 B 站 URL（i[0-2].hdslb.com/bfs/...）→ 转为 http://127.0.0.1:<port>/image?url=...
// - 非 B 站 URL 或已是代理 URL → 原样返回
// - 解析失败时回退原始 URL，避免封面永久空白
const resolvedCoverUrl = ref<string | null | undefined>(undefined)
let resolveSeq = 0
watch(
  () => props.coverUrl,
  async (url) => {
    const seq = ++resolveSeq
    if (!url) {
      resolvedCoverUrl.value = url
      return
    }
    // 先清空，避免异步解析期间短暂显示上一张封面（解析完成后再显示新封面）
    resolvedCoverUrl.value = undefined
    try {
      const resolved = await resolveBilibiliImageUrl(url)
      // 只应用最新一次 props 变化的结果，避免快速切换时旧响应覆盖新封面
      if (seq === resolveSeq) {
        resolvedCoverUrl.value = resolved
      }
    } catch (error) {
      console.warn('[CoverPlaceholder] 封面代理解析失败，回退原始 URL:', error)
      if (seq === resolveSeq) {
        resolvedCoverUrl.value = url
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="md3-cover"
    :style="{
      width: size + 'px',
      height: size + 'px',
      borderRadius: radius + 'px',
      background: `linear-gradient(135deg, ${gradient.color1}, ${gradient.color2})`,
    }"
  >
    <span
      v-if="firstChar"
      class="md3-cover__char"
      :style="{ fontSize: size * 0.45 + 'px' }"
    >{{ firstChar }}</span>
    <img
      v-if="resolvedCoverUrl"
      :src="resolvedCoverUrl"
      class="md3-cover__img"
      alt=""
      draggable="false"
    >
  </div>
</template>

<style scoped>
.md3-cover {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.md3-cover__char {
  font-weight: bold;
  color: rgba(255, 255, 255, 0.7);
  user-select: none;
  line-height: 1;
}
.md3-cover__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}
</style>
