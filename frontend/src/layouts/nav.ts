import { CalendarDays, CheckCircle2, Clock, History, Home, List, type LucideIcon } from 'lucide-react'
import type { Role } from '@/types'

export interface NavItem {
  to: string
  label: string
  /** Shorter label for the mobile tab bar. */
  tabLabel: string
  icon: LucideIcon
  end?: boolean
  showPendingCount?: boolean
}

export const NAV: Record<Role, NavItem[]> = {
  hr: [
    { to: '/hr/pending', label: 'Pending', tabLabel: 'Pending', icon: Clock, showPendingCount: true },
    { to: '/hr/approved', label: 'Approved', tabLabel: 'Approved', icon: CheckCircle2 },
    { to: '/hr/requests', label: 'All requests', tabLabel: 'All', icon: List, end: true },
    { to: '/calendar', label: 'Calendar', tabLabel: 'Calendar', icon: CalendarDays },
  ],
  employee: [
    { to: '/me', label: 'My leave', tabLabel: 'My leave', icon: Home, end: true },
    { to: '/me/history', label: 'History', tabLabel: 'History', icon: History },
    { to: '/calendar', label: 'Team calendar', tabLabel: 'Calendar', icon: CalendarDays },
  ],
}
