import type { Employee, Session } from '@/types'
import { request } from './http'

export const authApi = {
  authConfig: () => request<{ googleClientId: string }>('/auth/config'),
  login: (email: string, password: string) => request<Session>('/auth/login', { method: 'POST', body: { email, password } }),
  loginWithGoogle: (credential: string) => request<Session>('/auth/google', { method: 'POST', body: { credential } }),
  me: () => request<Employee>('/auth/me'),
}
