import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { keys } from '@/api/queries'
import { Alert } from '@/components/Alert'
import { AppButton, IconButton } from '@/components/AppButton'
import { Avatar } from '@/components/Avatar'
import { Card, CardTitle } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { StickyBar } from '@/components/StickyBar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUser } from '@/features/auth/AuthProvider'
import { ROLE_LABEL, ageOn, fullName } from '@/lib/format'
import { inputHeight } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'

/** Own profile (both roles). Email is read-only; HR can't edit any of this. */
export function ProfilePage() {
  const user = useUser()
  const client = useQueryClient()
  const isMobile = useIsMobile()
  const photo = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, dateOfBirth: user.dateOfBirth })
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [photoError, setPhotoError] = useState<string | null>(null)
  const refreshMe = () => client.invalidateQueries({ queryKey: keys.me })

  const profileDirty = form.firstName !== user.firstName || form.lastName !== user.lastName || form.dateOfBirth !== user.dateOfBirth
  const pwDirty = Boolean(pw.current || pw.next || pw.confirm)
  const pwError = !pwDirty ? '' : pw.next.length < 8 ? 'Use at least 8 characters for the new password.'
    : pw.next !== pw.confirm ? 'The new passwords do not match.' : ''
  const age = form.dateOfBirth ? ageOn(form.dateOfBirth) : null

  const save = useMutation({
    mutationFn: async () => {
      if (profileDirty) await api.me.updateProfile(form)
      if (pwDirty) await api.me.changePassword(pw.current, pw.next, pw.confirm)
    },
    onSuccess: () => {
      toast.success(pwDirty ? 'Profile and password saved' : 'Profile saved')
      setPw({ current: '', next: '', confirm: '' })
      return refreshMe()
    },
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const f = await api.files.upload('avatar', file)
      return api.me.updateProfile({ ...form, firstName: user.firstName, lastName: user.lastName, dateOfBirth: user.dateOfBirth, avatarFileId: f.id })
    },
    onSuccess: () => { toast.success('Photo updated'); return refreshMe() },
    onError: (e) => setPhotoError(e.message),
  })
  const pickPhoto = (file?: File) => {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) return setPhotoError('Use a JPG or PNG photo.')
    if (file.size > 2 * 1024 * 1024) return setPhotoError('The photo must be 2 MB or smaller.')
    setPhotoError(null)
    upload.mutate(file)
  }

  const saveButton = (
    <AppButton icon={Save} label="Save changes" variant="primary" size={isMobile ? 'sticky' : undefined}
      loading={save.isPending} disabled={(!profileDirty && !pwDirty) || Boolean(pwError) || (age !== null && age < 18)} onClick={() => save.mutate()} />
  )

  return (
    <>
      <PageHeader title="Profile" actions={!isMobile && saveButton} />
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-5">
          <Card className="flex items-center gap-5 p-5">
            <div className="relative shrink-0">
              <Avatar name={fullName(user)} src={user.avatarUrl} size={88} />
              <IconButton icon={Camera} label="Change photo" variant="secondary" loading={upload.isPending}
                className="absolute -right-1 -bottom-1 rounded-full" onClick={() => photo.current?.click()} />
              <input ref={photo} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden
                onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold">{fullName(user)}</p>
              <p className="text-[13px] text-muted-foreground">{ROLE_LABEL[user.role]} · {user.department?.name ?? 'No department'}</p>
              {photoError && <p role="alert" className="mt-1 text-xs text-danger">{photoError}</p>}
            </div>
          </Card>
          <Card className="flex flex-col gap-4 p-5">
            <CardTitle>Personal details</CardTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldBox id="firstName" label="First name">
                <Input id="firstName" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className={inputHeight} />
              </FieldBox>
              <FieldBox id="lastName" label="Last name">
                <Input id="lastName" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className={inputHeight} />
              </FieldBox>
              <FieldBox id="dob" label="Date of birth" hint={age !== null && age < 18 ? 'You must be at least 18.' : undefined}>
                <Input id="dob" type="date" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} className={inputHeight} />
              </FieldBox>
              <FieldBox id="email" label="Email">
                <Input id="email" value={user.email} readOnly className={cn(inputHeight, 'bg-sunk')} />
              </FieldBox>
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-4 p-5">
            {/* A Google-only account has no password yet; the API then skips the current-password check. */}
            <CardTitle>{user.hasPassword ? 'Change password' : 'Set a password'}</CardTitle>
            {user.hasPassword && (
              <FieldBox id="current" label="Current password">
                <Input id="current" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} className={inputHeight} />
              </FieldBox>
            )}
            <FieldBox id="new" label="New password">
              <Input id="new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} className={inputHeight} />
            </FieldBox>
            <FieldBox id="confirm" label="Confirm new password">
              <Input id="confirm" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} className={inputHeight} />
            </FieldBox>
            {pwError && <p className="text-xs text-danger">{pwError}</p>}
          </Card>
        </div>
      </div>
      {isMobile && <StickyBar>{saveButton}</StickyBar>}
    </>
  )
}

function FieldBox({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
