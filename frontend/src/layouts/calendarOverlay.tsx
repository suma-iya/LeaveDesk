import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// The Team calendar is an overlay any list page can open from its header.
// Whether it is open is remembered for the browser session, so it stays
// open (or closed) as you move between pages.

const KEY = 'leavedesk-calendar-open'

interface CalendarOverlayState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const Context = createContext<CalendarOverlayState | null>(null)

function readOpen() {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function CalendarOverlayProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(readOpen)
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    try {
      sessionStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      // storage blocked: the state just isn't remembered
    }
  }, [])
  const value = useMemo(() => ({ open, setOpen, toggle: () => setOpen(!open) }), [open, setOpen])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCalendarOverlay() {
  const context = useContext(Context)
  if (!context) throw new Error('useCalendarOverlay must be used inside CalendarOverlayProvider')
  return context
}
