import { CheckCircle2, Clock, History, Home, List, Users, type LucideIcon } from 'lucide-react'
import type { Role } from '@/types'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Which "something new" dot this item shows. */
  dot?: 'pendingRequests'
  /** Active when the path matches and (optionally) ?status= does too. */
  isActive: (pathname: string, status: string | null) => boolean
}

export const NAV: Record<Role, NavItem[]> = {
  hr: [
    { label: 'Pending', to: '/hr/pending', icon: Clock, dot: 'pendingRequests', isActive: (p) => p === '/hr/pending' },
    { label: 'Approved', to: '/hr/requests?status=approved', icon: CheckCircle2, isActive: (p, s) => p === '/hr/requests' && s === 'approved' },
    { label: 'All', to: '/hr/requests?status=all', icon: List, isActive: (p, s) => p === '/hr/requests' && s !== 'approved' },
    { label: 'People', to: '/hr/people', icon: Users, isActive: (p) => p.startsWith('/hr/people') },
  ],
  employee: [
    { label: 'My leave', to: '/me', icon: Home, isActive: (p) => p === '/me' },
    { label: 'History', to: '/me/history', icon: History, isActive: (p) => p === '/me/history' },
  ],
}
