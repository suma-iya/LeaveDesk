import { useLocation } from 'react-router-dom'
import { CalendarDays, Download, Moon, Plus, Sun } from 'lucide-react'
import { AppButton } from '@/components/AppButton'
import { useUser } from '@/features/auth/AuthProvider'
import { homeFor } from '@/features/auth/homeFor'
import { useTheme } from '@/lib/theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'

/**
 * Right side of every list page header, in this order: Request leave
 * (primary), the Team calendar, the theme toggle, and Export (HR tables;
 * hidden on mobile). The calendar icon links to /calendar, remembering the
 * page it came from; on /calendar it shows as pressed and links back there
 * (or to the role's home page).
 */
export function HeaderActions({ exportHref }: { exportHref?: string }) {
  const isMobile = useIsMobile()
  const user = useUser()
  const location = useLocation()
  const onCalendar = location.pathname === '/calendar'
  const from = (location.state as { from?: string } | null)?.from
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return (
    <>
      <AppButton icon={Plus} label="Request leave" variant="primary" to="/me/request/new" />
      <AppButton shape="icon" icon={CalendarDays} label="Team calendar" variant="secondary"
        to={onCalendar ? (from ?? homeFor(user)) : '/calendar'}
        linkState={onCalendar ? undefined : { from: location.pathname + location.search }}
        aria-current={onCalendar ? 'page' : undefined} className={cn(onCalendar && 'border-highlight bg-sunk')} />
      <AppButton shape="icon" icon={nextTheme === 'dark' ? Moon : Sun} label={`Switch to ${nextTheme} theme`} variant="secondary"
        onClick={toggleTheme} />
      {exportHref && !isMobile && <AppButton icon={Download} label="Export" href={exportHref} download="" />}
    </>
  )
}
