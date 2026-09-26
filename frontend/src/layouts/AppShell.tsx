import { Fragment, useEffect, type CSSProperties } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { AppButton } from '@/components/AppButton'
import { Logo } from '@/components/Logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUser } from '@/features/auth/AuthProvider'
import { homeFor } from '@/features/auth/homeFor'
import { TeamCalendarDialog } from '@/features/calendar/TeamCalendarDialog'
import { useSidebarState } from '@/lib/sidebar'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import { AccountMenu } from './AccountMenu'
import { CalendarOverlayProvider } from './calendarOverlay'
import { NAV, type NavItem } from './nav'
import { useNewItems } from './useNewItems'

// Desktop sidebar widths. --sidebar-w is set on the shell's root and used by
// both the <nav> and the <main> offset, so they always move together.
const SIDEBAR_W = { expanded: '240px', collapsed: '64px' }
// The sidebar's side padding. The active bar is offset by it, so it sits on
// the sidebar's edge in both states; 64px − 2 × 12px leaves the 40px icon.
const SIDEBAR_PAD = '12px'
const NAV_ID = 'app-sidebar'
// What each count means, for screen readers: "23 pending".
const COUNT_NOUN: Record<NonNullable<NavItem['dot']>, string> = { pendingRequests: 'pending' }

type Layout = 'mobile' | 'expanded' | 'collapsed'

/** Every signed-in page: left sidebar on desktop, bottom tab bar on mobile. */
export function AppShell() {
  const user = useUser()
  const isMobile = useIsMobile()
  const location = useLocation()
  const status = new URLSearchParams(location.search).get('status')
  const counts = useNewItems(user.role === 'hr')
  const items = NAV[user.role]
  const sidebar = useSidebarState()
  const collapsed = sidebar.collapsed && !isMobile
  const layout: Layout = isMobile ? 'mobile' : collapsed ? 'collapsed' : 'expanded'
  useToggleShortcut(sidebar.toggle, !isMobile)

  const shellStyle = {
    '--sidebar-w': collapsed ? SIDEBAR_W.collapsed : SIDEBAR_W.expanded,
    '--sidebar-pad': SIDEBAR_PAD,
  } as CSSProperties

  const links = items.map((item, i) => (
    <Fragment key={item.label}>
      {layout !== 'mobile' && item.section && item.section !== items[i - 1]?.section && (
        collapsed
          ? <div role="separator" className="mx-1 my-2 h-px bg-border" />
          : <p className="px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{item.section}</p>
      )}
      <RailLink item={item} active={item.isActive(location.pathname, status)} layout={layout}
        count={item.dot ? counts[item.dot] : 0} countNoun={item.dot ? COUNT_NOUN[item.dot] : ''} />
    </Fragment>
  ))

  const home = (
    <Link to={homeFor(user)} aria-label="LeaveDesk home" className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Logo withName={!collapsed} />
    </Link>
  )

  return (
    <CalendarOverlayProvider>
      <div className="min-h-svh bg-background" style={shellStyle}>
        {isMobile ? (
          <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex h-[72px] items-center justify-around border-t bg-rail px-2 pb-[env(safe-area-inset-bottom)]">
            {links}
            <AccountMenu layout="mobile" />
          </nav>
        ) : (
          <nav id={NAV_ID} aria-label="Main"
            className="fixed inset-y-0 left-0 z-30 flex w-[var(--sidebar-w)] flex-col overflow-x-hidden border-r bg-rail px-[var(--sidebar-pad)] py-4 whitespace-nowrap transition-[width] duration-200 motion-reduce:transition-none">
            <div className={cn('mb-6 flex', collapsed ? 'flex-col items-center gap-2' : 'h-10 items-center justify-between')}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{home}</TooltipTrigger>
                  <TooltipContent side="right">LeaveDesk home</TooltipContent>
                </Tooltip>
              ) : home}
              <AppButton shape="icon" variant="ghost" icon={collapsed ? PanelLeftOpen : PanelLeftClose}
                label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed} aria-controls={NAV_ID} onClick={sidebar.toggle} />
            </div>
            <div className="flex flex-col gap-1">{links}</div>
            <AccountMenu layout={collapsed ? 'collapsed' : 'expanded'} className={cn('mt-auto', collapsed && 'self-center')} />
          </nav>
        )}
        <main className={cn('mx-auto flex max-w-[1600px] flex-col',
          isMobile ? 'gap-4 px-4 pt-4 pb-24' : 'ml-[var(--sidebar-w)] gap-5 px-10 py-7 transition-[margin] duration-200 motion-reduce:transition-none')}>
          <Outlet />
        </main>
        <TeamCalendarDialog />
      </div>
    </CalendarOverlayProvider>
  )
}

/** Ctrl+B / Cmd+B toggles the sidebar, except while typing in a field. */
function useToggleShortcut(toggle: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'b' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle, enabled])
}

/**
 * Expanded: a full-width 36px row, 18px icon beside the label, count pill on
 * the right. Collapsed: the icon alone in a 40×40 hit area with the label in
 * a tooltip; the count becomes a dot. Mobile: 64×58, icon over label.
 * Active = sunk + a 3px accent bar on the sidebar's edge (desktop).
 */
function RailLink({ item, active, layout, count, countNoun }: {
  item: NavItem; active: boolean; layout: Layout; count: number; countNoun: string
}) {
  const Icon = item.icon
  const countLabel = `${count} ${countNoun}`
  const link = (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex rounded-md transition-colors',
        layout === 'mobile' && 'h-[58px] w-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
        layout === 'expanded' && 'h-9 w-full items-center gap-2.5 px-2.5 text-[13.5px] font-medium',
        layout === 'collapsed' && 'size-10 items-center justify-center self-center',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        active ? 'bg-sunk text-foreground' : 'text-muted-foreground hover:bg-soft-hover hover:text-foreground',
        active && layout !== 'mobile' && 'before:absolute before:top-2 before:bottom-2 before:left-[calc(-1*var(--sidebar-pad))] before:w-[3px] before:rounded-r before:bg-highlight',
      )}
    >
      <span className="relative">
        <Icon className={layout === 'mobile' ? 'size-5' : 'size-[18px]'} aria-hidden />
        {count > 0 && layout === 'mobile' && (
          <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-pending ring-2 ring-rail" aria-label="New" />
        )}
        {count > 0 && layout === 'collapsed' && (
          <span role="img" aria-label={countLabel} className="absolute -top-0.5 -right-1 size-2 rounded-full bg-pending ring-2 ring-rail" />
        )}
      </span>
      {layout === 'mobile' && item.label}
      {layout === 'expanded' && <span className="min-w-0 truncate">{item.label}</span>}
      {layout === 'collapsed' && <span className="sr-only">{item.label}</span>}
      {count > 0 && layout === 'expanded' && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-pending-bg px-1.5 text-[11px] font-semibold text-pending tabular-nums">
          <span aria-hidden>{count > 99 ? '99+' : count}</span>
          <span className="sr-only">, {countLabel}</span>
        </span>
      )}
    </Link>
  )
  if (layout !== 'collapsed') return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}
