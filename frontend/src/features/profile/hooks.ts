import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api'
import { keys } from '@/api/queries'
import type { ProfileUpdate } from '@/types'

export const useProfile = () => useQuery({ queryKey: keys.profile, queryFn: api.getProfile })

function useRefreshUser() {
  const queryClient = useQueryClient()
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.profile }),
    queryClient.invalidateQueries({ queryKey: keys.me }),
    queryClient.invalidateQueries({ queryKey: keys.requests }), // names shown in tables
  ])
}

export function useUpdateProfile() {
  const refresh = useRefreshUser()
  return useMutation({
    mutationFn: (update: ProfileUpdate) => api.updateProfile(update),
    onSuccess: () => { toast.success('Profile saved'); return refresh() },
  })
}

export function useUploadAvatar() {
  const refresh = useRefreshUser()
  return useMutation({
    mutationFn: (file: File) => api.uploadAvatar(file),
    onSuccess: () => { toast.success('Photo updated'); return refresh() },
    onError: (error) => toast.error(error.message),
  })
}
