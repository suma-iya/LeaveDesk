import { useSyncExternalStore } from 'react'

// Below 768px the app switches to the mobile layouts.
const query = window.matchMedia('(max-width: 767.98px)')

const subscribe = (onChange: () => void) => {
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, () => query.matches, () => false)
}
