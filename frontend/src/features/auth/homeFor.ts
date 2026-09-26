import type { User } from '@/types'

/** Where each role lands after signing in. */
export const homeFor = (user: Pick<User, 'role'>) => (user.role === 'hr' ? '/hr/pending' : '/me')
