import { CheckCircle2, Clock, History, Home, List, Users, type LucideIcon } from 'lucide-react'
import type { Role } from '@/types'

/** One count per list page, from the same query as that page (see useNavCounts). */
export type NavCount = 'pendingRequests' | 'approvedRequests' | 'allRequests' | 'people' | 'history'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Which list count this item shows: a pill when expanded, a dot when collapsed or on mobile. */
  count?: NavCount
  /** Optional group heading shown above the first item of each group (a divider when collapsed). */
  section?: string
  /** Active when the path matches and (optionally) ?status= does too. */
  isActive: (pathname: string, status: string | null) => boolean
}

export const NAV: Record<Role, NavItem[]> = {
  hr: [
    { label: 'Pending', to: '/hr/pending', icon: Clock, count: 'pendingRequests', isActive: (p) => p === '/hr/pending' },
    { label: 'Approved', to: '/hr/requests?status=approved', icon: CheckCircle2, count: 'approvedRequests', isActive: (p, s) => p === '/hr/requests' && s === 'approved' },
    { label: 'All', to: '/hr/requests?status=all', icon: List, count: 'allRequests', isActive: (p, s) => p === '/hr/requests' && s !== 'approved' },
    { label: 'People', to: '/hr/people', icon: Users, count: 'people', isActive: (p) => p.startsWith('/hr/people') },
  ],
  employee: [
    { label: 'My leave', to: '/me', icon: Home, isActive: (p) => p === '/me' },
    { label: 'History', to: '/me/history', icon: History, count: 'history', isActive: (p) => p === '/me/history' },
  ],
}
