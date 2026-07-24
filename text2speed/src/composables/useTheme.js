import { ref, watch } from 'vue'

const STORAGE_KEY = 'nghitts-theme'
const isDark = ref(document.documentElement.classList.contains('dark'))

watch(isDark, (dark) => {
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
})

export function useTheme() {
  return {
    isDark,
    toggle: () => {
      isDark.value = !isDark.value
    },
  }
}
