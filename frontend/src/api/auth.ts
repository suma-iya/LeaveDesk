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

/** A verified Google identity waiting to finish sign-up. */
export interface GooglePending {
  email: string
  firstName: string
  lastName: string
}

export interface GoogleCompleteInput {
  dateOfBirth: string
  firstName: string
  lastName: string
}

export const authApi = {
  bootstrap: () => request<{ hasHR: boolean; google: boolean }>('/auth/bootstrap'),
  register: (input: RegisterInput) => request<User>('/auth/register', { method: 'POST', body: input }),
  login: (email: string, password: string) => request<User>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User; balances?: Balance[] }>('/me'),
  /** 404 when there is no Google sign-up waiting (or it expired). */
  googlePending: () => request<GooglePending>('/auth/google/pending'),
  /** The email comes from the server's signed cookie, not from here. */
  googleComplete: (input: GoogleCompleteInput) => request<User>('/auth/google/complete', { method: 'POST', body: input }),
  /** Full-page redirect: Google's consent screen, then back to the app. */
  googleStartUrl: '/api/auth/google/start',
}
