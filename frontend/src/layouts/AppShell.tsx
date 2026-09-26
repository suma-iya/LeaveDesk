import { useState, type CSSProperties } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { useUser } from '@/features/auth/AuthProvider'
import { homeFor } from '@/features/auth/homeFor'
import { TeamCalendarDialog } from '@/features/calendar/TeamCalendarDialog'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import { AccountMenu } from './AccountMenu'
import { CalendarOverlayProvider } from './calendarOverlay'
import { NAV, type NavItem } from './nav'
import { useNewItems } from './useNewItems'

// Desktop sidebar widths. --sidebar-w is set on the shell's root and used by
// both the <nav> and the <main> offset, so they always move together.
const SIDEBAR_W = { expanded: '240px', collapsed: '64px' }

/** Every signed-in page: left sidebar on desktop, bottom tab bar on mobile. */
export function AppShell() {
  const user = useUser()
  const isMobile = useIsMobile()
  const location = useLocation()
  const status = new URLSearchParams(location.search).get('status')
  const dots = useNewItems(user.role === 'hr')
  const items = NAV[user.role]
  const [collapsed] = useState(false)
  const shellStyle = { '--sidebar-w': collapsed ? SIDEBAR_W.collapsed : SIDEBAR_W.expanded } as CSSProperties

  const links = items.map((item) => (
    <RailLink key={item.label} item={item} active={item.isActive(location.pathname, status)}
      dot={item.dot ? dots[item.dot] : false} mobile={isMobile} />
  ))

  return (
    <CalendarOverlayProvider>
      <div className="min-h-svh bg-background" style={shellStyle}>
        {isMobile ? (
          <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex h-[72px] items-center justify-around border-t bg-rail px-2 pb-[env(safe-area-inset-bottom)]">
            {links}
            <AccountMenu side="top" />
          </nav>
        ) : (
          <nav aria-label="Main" className="fixed inset-y-0 left-0 z-30 flex w-[var(--sidebar-w)] flex-col border-r bg-rail px-3 py-4 transition-[width] duration-200 motion-reduce:transition-none">
            <Link to={homeFor(user)} aria-label="LeaveDesk home" className="mb-6 self-start rounded-lg px-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Logo withName />
            </Link>
            <div className="flex flex-col gap-1">{links}</div>
            <AccountMenu className="mt-auto self-start" />
          </nav>
        )}
        <main className={cn('mx-auto flex max-w-[1600px] flex-col', isMobile ? 'gap-4 px-4 pt-4 pb-24' : 'ml-[var(--sidebar-w)] gap-5 px-10 py-7 transition-[margin] duration-200 motion-reduce:transition-none')}>
          <Outlet />
        </main>
        <TeamCalendarDialog />
      </div>
    </CalendarOverlayProvider>
  )
}

/**
 * Desktop: a full-width 36px row, 18px icon beside the label; active = sunk
 * + 3px accent bar on the sidebar's edge. Mobile: 64×58, icon over label.
 */
function RailLink({ item, active, dot, mobile }: { item: NavItem; active: boolean; dot: boolean; mobile: boolean }) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex rounded-md transition-colors',
        mobile
          ? 'h-[58px] w-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold'
          : 'h-9 w-full items-center gap-2.5 px-2.5 text-[13.5px] font-medium',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active ? 'bg-sunk text-foreground' : 'text-muted-foreground hover:bg-soft-hover hover:text-foreground',
        active && !mobile && 'before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r before:bg-highlight',
      )}
    >
      <span className="relative">
        <Icon className={mobile ? 'size-5' : 'size-[18px]'} aria-hidden />
        {dot && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-pending ring-2 ring-rail" aria-label="New" />}
      </span>
      {item.label}
    </Link>
  )
}
