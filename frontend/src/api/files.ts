import type { FileMeta } from '@/types'
import { request } from './http'

export const filesApi = {
  upload: (kind: 'avatar' | 'attachment', file: File) => {
    const form = new FormData()
    form.append('kind', kind)
    form.append('file', file)
    return request<FileMeta>('/files', { method: 'POST', body: form })
  },
}
