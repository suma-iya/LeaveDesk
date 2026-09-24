import { Link, NavLink, Outlet } from 'react-router-dom'
import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import { IconButton } from '@/components/Button'
import { Logo } from '@/components/Logo'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { useTheme } from '@/lib/theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import { AvatarMenu } from './AvatarMenu'
import { NAV, type NavItem } from './nav'
import { Notifications } from './Notifications'
import { SubPageProvider, useSubPageState } from './subPage'
import { usePendingCount } from './usePendingCount'

export function AppShell() {
  return (
    <SubPageProvider>
      <Shell />
    </SubPageProvider>
  )
}

function Shell() {
  const isMobile = useIsMobile()
  const { role } = useAuth()
  const items = NAV[role ?? 'employee']
  const pendingCount = usePendingCount(role === 'hr')
  const subPage = useSubPageState()

  if (isMobile) {
    return (
      <div className="min-h-svh bg-background">
        <MobileAppBar />
        <main className={cn('flex flex-col gap-4 px-4 pt-4', subPage ? 'pb-24' : 'pb-[96px]')}>
          <Outlet />
        </main>
        {!subPage && <TabBar items={items} />}
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 h-16 border-b bg-header">
        <div className="mx-auto flex h-full max-w-[1440px] items-center gap-8 px-10">
          <Link to="/" aria-label="LeaveDesk home"><Logo /></Link>
          <nav aria-label="Main" className="flex h-full items-stretch gap-6">
            {items.map((item) => <TopNavLink key={item.to} item={item} count={item.showPendingCount ? pendingCount : undefined} />)}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Notifications />
            <span className="mx-2 h-6 w-px bg-border" aria-hidden />
            <AvatarMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1440px] flex-col gap-5 px-10 py-7">
        <Outlet />
      </main>
    </div>
  )
}

function TopNavLink({ item, count }: { item: NavItem; count?: number }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => cn(
        'relative flex h-16 items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground',
        'focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent',
        isActive && 'text-foreground after:bg-primary',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {item.label}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-pending-bg px-1.5 py-px text-[11px] font-bold text-pending" aria-label={`${count} pending`}>
          {count}
        </span>
      )}
    </NavLink>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <IconButton
      icon={theme === 'dark' ? Sun : Moon}
      label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      variant="ghost"
      onClick={toggleTheme}
    />
  )
}

function MobileAppBar() {
  const user = useUser()
  const subPage = useSubPageState()
  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b bg-header px-4">
      {subPage ? (
        <>
          <IconButton icon={ArrowLeft} label="Back" variant="ghost" to={subPage.back} className="-ml-2" />
          <h1 className="min-w-0 flex-1 truncate text-base font-bold">{subPage.title}</h1>
        </>
      ) : (
        <Link to="/" aria-label="LeaveDesk home" className="flex-1"><Logo /></Link>
      )}
      <Notifications />
      <Link to="/profile" aria-label="My profile" className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarUrl} size={34} />
      </Link>
    </header>
  )
}

function TabBar({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex h-[72px] items-center justify-around border-t bg-header px-2 pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink key={item.to} to={item.to} end={item.end}
            className="group flex min-w-16 flex-col items-center gap-1 text-[11.5px] font-semibold text-muted-foreground focus-visible:outline-none aria-[current=page]:text-foreground">
            <span className="flex h-8 w-14 items-center justify-center rounded-full group-focus-visible:ring-2 group-focus-visible:ring-ring group-aria-[current=page]:bg-sunk">
              <Icon className="size-5" aria-hidden />
            </span>
            {item.tabLabel}
          </NavLink>
        )
      })}
    </nav>
  )
}
