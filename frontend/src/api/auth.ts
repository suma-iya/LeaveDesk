import type { Balance, User } from '@/types'
import { request } from './http'

export interface RegisterInput {
  firstName: string
  lastName: string
  dateOfBirth: string
  email: string
  password: string
  confirmPassword: string
}

export const authApi = {
  bootstrap: () => request<{ hasHR: boolean; google: boolean }>('/auth/bootstrap'),
  register: (input: RegisterInput) => request<User>('/auth/register', { method: 'POST', body: input }),
  login: (email: string, password: string) => request<User>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User; balances?: Balance[] }>('/me'),
  /** Full-page redirect: Google's consent screen, then back to the app. */
  googleStartUrl: '/api/auth/google/start',
}
