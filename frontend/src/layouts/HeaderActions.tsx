import { CalendarDays, Download, Moon, Plus, Sun } from 'lucide-react'
import { AppButton } from '@/components/AppButton'
import { useTheme } from '@/lib/theme'
import { useIsMobile } from '@/lib/useIsMobile'

/**
 * Right side of every list page header, in this order: Request leave
 * (primary), the Team calendar (opens /calendar), the theme toggle, and
 * Export (HR tables; hidden on mobile).
 */
export function HeaderActions({ exportHref }: { exportHref?: string }) {
  const isMobile = useIsMobile()
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return (
    <>
      <AppButton icon={Plus} label="Request leave" variant="primary" to="/me/request/new" />
      <AppButton shape="icon" icon={CalendarDays} label="Team calendar" variant="secondary" to="/calendar" />
      <AppButton shape="icon" icon={nextTheme === 'dark' ? Moon : Sun} label={`Switch to ${nextTheme} theme`} variant="secondary"
        onClick={toggleTheme} />
      {exportHref && !isMobile && <AppButton icon={Download} label="Export" href={exportHref} download="" />}
    </>
  )
}
