import type { Balance, User } from '@/types'
import { request, toQuery } from './http'

export interface ProfileInput {
  firstName: string
  lastName: string
  dateOfBirth: string
  avatarFileId?: string | null
}

export const meApi = {
  updateProfile: (input: ProfileInput) => request<User>('/me', { method: 'PATCH', body: input }),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    request<void>('/me/password', { method: 'POST', body: { currentPassword, newPassword, confirmPassword } }),
  balances: (year: number) => request<Balance[]>(`/me/balances${toQuery({ year })}`),
}
