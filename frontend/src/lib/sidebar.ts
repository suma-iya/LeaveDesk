import { useSyncExternalStore } from 'react'

// Whether the desktop sidebar is collapsed to icons. The choice is kept per
// browser in localStorage; without one (or with storage blocked) the sidebar
// starts expanded.

type SidebarState = 'expanded' | 'collapsed'

const STORAGE_KEY = 'leavedesk-sidebar'
const listeners = new Set<() => void>()

function storedState(): SidebarState {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed' ? 'collapsed' : 'expanded'
  } catch {
    return 'expanded'
  }
}

let current: SidebarState = storedState()

function setState(state: SidebarState) {
  try {
    localStorage.setItem(STORAGE_KEY, state)
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
  current = state
  listeners.forEach((listener) => listener())
}

function toggle() {
  setState(current === 'collapsed' ? 'expanded' : 'collapsed')
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSidebarState() {
  const state = useSyncExternalStore(subscribe, () => current, () => 'expanded' as const)
  return { collapsed: state === 'collapsed', toggle }
}
