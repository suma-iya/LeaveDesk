import { NavLink, Outlet } from 'react-router-dom'
import { CalendarCheck, LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MANAGER_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/requests', label: 'Leave requests' },
  { to: '/employees', label: 'Employees' },
]
const EMPLOYEE_LINKS = [{ to: '/my-leaves', label: 'My leaves' }]

export function AppLayout() {
  const { user, isManager, logout } = useAuth()
  const links = isManager ? MANAGER_LINKS : EMPLOYEE_LINKS

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <CalendarCheck className="size-5 text-primary" />
            Leave Tracker
          </div>
          <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => cn(
                  'rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground',
                  isActive && 'bg-muted font-medium text-foreground',
                )}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Badge variant="secondary">{user.role === 'MANAGER' ? 'Manager' : 'Employee'}</Badge>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out" title="Log out">
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-end gap-3">{children}</div>}
    </div>
  )
}
