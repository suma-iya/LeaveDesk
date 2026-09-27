import { useSyncExternalStore } from 'react'

// The theme is the `.dark` class on <html>. A user's explicit choice is kept
// in localStorage; until they choose, it follows prefers-color-scheme.
// index.html applies the same logic inline before React loads, so the first
// paint already has the right colours.

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'leavedesk-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

let current: Theme = storedTheme() ?? (media.matches ? 'dark' : 'light')

function apply(theme: Theme) {
  current = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  listeners.forEach((listener) => listener())
}

media.addEventListener('change', (event) => {
  if (!storedTheme()) apply(event.matches ? 'dark' : 'light')
})

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
  apply(theme)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current, () => current)
  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  }
}
