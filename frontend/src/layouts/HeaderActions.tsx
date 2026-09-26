import { CalendarDays, Download, Plus } from 'lucide-react'
import { AppButton } from '@/components/AppButton'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import { useCalendarOverlay } from './calendarOverlay'

/**
 * Right side of every list page header, in this order: Request leave
 * (primary), the Calendar toggle, and Export (HR tables; hidden on mobile).
 */
export function HeaderActions({ exportHref }: { exportHref?: string }) {
  const isMobile = useIsMobile()
  const { open, toggle } = useCalendarOverlay()
  return (
    <>
      <AppButton icon={Plus} label="Request leave" variant="primary" to="/me/request/new" />
      <AppButton shape="icon" icon={CalendarDays} label="Team calendar" variant="secondary" aria-pressed={open}
        onClick={toggle} className={cn(open && 'border-highlight bg-sunk')} />
      {exportHref && !isMobile && <AppButton icon={Download} label="Export" href={exportHref} download="" />}
    </>
  )
}
