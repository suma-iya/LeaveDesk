import type { Attachment, Profile, ProfileUpdate } from '@/types'
import { request } from './http'

const upload = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return form
}

export const profileApi = {
  getProfile: () => request<Profile>('/profile'),
  updateProfile: (update: ProfileUpdate) => request<Profile>('/profile', { method: 'PUT', body: update }),
  uploadAvatar: (file: File) => request<{ url: string }>('/profile/avatar', { method: 'POST', body: upload(file) }).then((r) => r.url),
  uploadAttachment: (file: File) => request<Attachment>('/attachments', { method: 'POST', body: upload(file) }),
}
