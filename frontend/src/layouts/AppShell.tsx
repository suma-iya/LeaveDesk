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

/** Every signed-in page: 80px left rail on desktop, bottom tab bar on mobile. */
export function AppShell() {
  const user = useUser()
  const isMobile = useIsMobile()
  const location = useLocation()
  const status = new URLSearchParams(location.search).get('status')
  const dots = useNewItems(user.role === 'hr')
  const items = NAV[user.role]

  const links = items.map((item) => (
    <RailLink key={item.label} item={item} active={item.isActive(location.pathname, status)}
      dot={item.dot ? dots[item.dot] : false} mobile={isMobile} />
  ))

  return (
    <CalendarOverlayProvider>
      <div className="min-h-svh bg-background">
        {isMobile ? (
          <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex h-[72px] items-center justify-around border-t bg-rail px-2 pb-[env(safe-area-inset-bottom)]">
            {links}
            <AccountMenu side="top" />
          </nav>
        ) : (
          <nav aria-label="Main" className="fixed inset-y-0 left-0 z-30 flex w-20 flex-col items-center border-r bg-rail py-4">
            <Link to={homeFor(user)} aria-label="LeaveDesk home" className="mb-6 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Logo />
            </Link>
            <div className="flex flex-col gap-1">{links}</div>
            <AccountMenu className="mt-auto" />
          </nav>
        )}
        <main className={cn('mx-auto flex max-w-[1600px] flex-col', isMobile ? 'gap-4 px-4 pt-4 pb-24' : 'ml-20 gap-5 px-10 py-7')}>
          <Outlet />
        </main>
        <TeamCalendarDialog />
      </div>
    </CalendarOverlayProvider>
  )
}

/** 64×58 item: 20px icon over an 11px label; active = sunk + 3px accent bar. */
function RailLink({ item, active, dot, mobile }: { item: NavItem; active: boolean; dot: boolean; mobile: boolean }) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-[58px] w-16 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-semibold transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active ? 'bg-sunk text-foreground' : 'text-muted-foreground hover:bg-soft-hover hover:text-foreground',
        active && !mobile && 'before:absolute before:top-2.5 before:bottom-2.5 before:-left-2 before:w-[3px] before:rounded-r before:bg-highlight',
      )}
    >
      <span className="relative">
        <Icon className="size-5" aria-hidden />
        {dot && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-pending ring-2 ring-rail" aria-label="New" />}
      </span>
      {item.label}
    </Link>
  )
}
