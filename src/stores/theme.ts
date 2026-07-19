import { computed, watchEffect } from 'vue'
import { defineStore } from 'pinia'
import { useStorage, useMediaQuery } from '@vueuse/core'

export type ThemeMode = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore('theme', () => {
  const mode = useStorage<ThemeMode>('bbplayer-theme', 'system')
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')

  const isDark = computed(() => {
    if (mode.value === 'dark') return true
    if (mode.value === 'light') return false
    return systemDark.value
  })

  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
  })

  function setMode(m: ThemeMode) {
    mode.value = m
  }

  return { mode, isDark, setMode }
})
