import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUser } from '@/features/auth/AuthProvider'
import { homeFor } from '@/features/auth/homeFor'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import { TeamCalendar } from './TeamCalendar'

/**
 * /calendar, opened from the calendar icon in list page headers. It looks
 * exactly like the former overlay: a rounded panel inset 20px over the
 * backdrop colour (full screen on phones). The X or Esc goes back to the
 * page it was opened from, or home when it was opened directly.
 */
export function CalendarPage() {
  const isMobile = useIsMobile()
  const user = useUser()
  const navigate = useNavigate()
  const location = useLocation()
  const close = useCallback(() => {
    if (location.key !== 'default') navigate(-1)
    else navigate(homeFor(user), { replace: true })
  }, [location.key, navigate, user])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Esc first closes an open dropdown (department, leave type), not the page.
      // This runs in the capture phase, before the dropdown handles the key.
      if (event.key !== 'Escape' || document.querySelector('[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]')) return
      close()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [close])

  return (
    <div className="fixed inset-0 bg-backdrop">
      <main aria-labelledby="calendar-title"
        className={cn('fixed flex flex-col gap-4 overflow-y-auto bg-background text-sm text-foreground ring-1 ring-foreground/10 outline-none',
          isMobile ? 'inset-0 h-svh w-full p-4' : 'inset-5 rounded-dialog px-6 py-[22px]')}>
        <TeamCalendar onClose={close} />
      </main>
    </div>
  )
}
