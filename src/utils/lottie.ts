/**
 * Lottie 染色工具
 * 参考 BBPlayer apps/mobile/src/utils/lottie.ts 的 tintLottieSource
 *
 * Lottie json 中用 [1, 1, 1, 1]（带空格，RGBA 归一化 0-1）作为白色占位符。
 * 本函数把所有白色占位符替换成目标 hex 颜色，实现 Lottie 跟随主题色。
 *
 * 注意：BBPlayer 原版正则 /\[1,1,1,1\]/g 不带空格，
 * 但本项目实际 json 里是 [1, 1, 1, 1]（带空格），
 * 所以正则改为允许逗号后任意空白。
 */

// Lottie json 在 TS 中是普通对象，这里用 Record<string, unknown> 表示
type LottieJson = Record<string, unknown>

/**
 * 将 hex 颜色转成 Lottie 归一化 RGBA 数组字符串，如 "#6750a4" => "0.4039,0.3137,0.6431,1"
 */
function hexToLottieColor(hex: string): string {
  const h = hex.replace('#', '')
  const r = (parseInt(h.slice(0, 2), 16) / 255).toFixed(4)
  const g = (parseInt(h.slice(2, 4), 16) / 255).toFixed(4)
  const b = (parseInt(h.slice(4, 6), 16) / 255).toFixed(4)
  return `${r},${g},${b},1`
}

/**
 * 把 Lottie json 中所有 [1, 1, 1, 1]（白色占位符）替换为目标 hex 颜色
 * 返回新的 json 对象，不修改原对象
 */
export function tintLottieSource(source: LottieJson, hexColor: string): LottieJson {
  const target = hexToLottieColor(hexColor)
  // 正则：匹配 [1, 1, 1, 1] / [1,1,1,1] / [1, 1,1, 1] 等任意空白组合
  const regex = /\[1\s*,\s*1\s*,\s*1\s*,\s*1\]/g
  try {
    const jsonStr = JSON.stringify(source)
    const tinted = jsonStr.replace(regex, `[${target}]`)
    return JSON.parse(tinted) as LottieJson
  } catch {
    return source
  }
}
