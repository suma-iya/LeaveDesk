import type { User } from '@/types'

/** Where each kind of account lands after signing in. */
export function homeFor(user: Pick<User, 'role' | 'status'>) {
  if (user.status === 'pending') return '/waiting'
  return user.role === 'hr' ? '/hr/pending' : '/me'
}
