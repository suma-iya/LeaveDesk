import type { Role } from '@/types'

export const homeFor = (role: Role) => (role === 'hr' ? '/hr/pending' : '/me')
