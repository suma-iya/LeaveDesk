import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Camera, LogOut, Moon, RotateCcw, Save, Sun } from 'lucide-react'
import { useBalances } from '@/api/queries'
import { Avatar } from '@/components/Avatar'
import { Button, IconButton } from '@/components/Button'
import { Card, CardTitle, StatTile } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/States'
import { StackedBar } from '@/components/StackedBar'
import { StickyBar } from '@/components/StickyBar'
import { TypeSwatch } from '@/components/LeaveTypeTag'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/AuthProvider'
import { yearlySegments } from '@/features/employee/BalanceCards'
import { useSubPage } from '@/layouts/subPage'
import { fullName } from '@/lib/format'
import { sumBalances } from '@/lib/leave'
import { useTheme } from '@/lib/theme'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import type { Profile } from '@/types'
import { useProfile, useUpdateProfile, useUploadAvatar } from './hooks'

export function ProfilePage() {
  const profile = useProfile()
  useSubPage('Profile & settings', '/')
  if (profile.isPending) return <Skeleton className="h-[560px] rounded-card" />
  if (profile.error) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
  // Re-mount the form after each save so it starts from the saved values.
  return <ProfileForm key={JSON.stringify(profile.data)} profile={profile.data} />
}

const formFrom = (p: Profile) => ({
  firstName: p.firstName, lastName: p.lastName, age: String(p.age), email: p.email,
  notifyOnChange: p.notifyOnChange, weeklyDigest: p.weeklyDigest, currentPassword: '', newPassword: '',
})

function ProfileForm({ profile }: { profile: Profile }) {
  const isMobile = useIsMobile()
  const location = useLocation()
  const { role, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const save = useUpdateProfile()
  const upload = useUploadAvatar()
  const photoInput = useRef<HTMLInputElement>(null)
  const settingsRef = useRef<HTMLElement>(null)
  const [form, setForm] = useState(() => formFrom(profile))
  const [photoError, setPhotoError] = useState<string | null>(null)
  const year = new Date().getFullYear()
  const balances = useBalances(profile.id, year).data

  // "Settings" in the avatar menu links to /profile#settings.
  useEffect(() => {
    if (location.hash === '#settings') settingsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [location.hash])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const dirty = JSON.stringify(form) !== JSON.stringify(formFrom(profile))

  const submit = () => save.mutate({
    firstName: form.firstName, lastName: form.lastName, age: Number(form.age), email: form.email,
    notifyOnChange: form.notifyOnChange, weeklyDigest: form.weeklyDigest,
    currentPassword: form.currentPassword || undefined, newPassword: form.newPassword || undefined,
  })

  const pickPhoto = (file: File | undefined) => {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) return setPhotoError('Use a JPG or PNG image.')
    if (file.size > 2 * 1024 * 1024) return setPhotoError('The photo must be 2 MB or smaller.')
    setPhotoError(null)
    upload.mutate(file)
  }

  const name = fullName(profile)
  const totals = balances && sumBalances(balances)

  const photoCard = (
    <Card className="flex items-center gap-5 p-5">
      <div className="relative shrink-0">
        <Avatar name={name} src={profile.avatarUrl} size={88} />
        <IconButton icon={Camera} label="Change photo" variant="secondary" loading={upload.isPending}
          className="absolute -right-1 -bottom-1 rounded-full" onClick={() => photoInput.current?.click()} />
        <input ref={photoInput} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[17px] font-bold">{name}</p>
        <p className="text-[13px] text-muted-foreground">{role === 'hr' ? 'HR' : 'Employee'} · {profile.department}</p>
        <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, square, up to 2 MB</p>
        {photoError && <p role="alert" className="mt-1 text-xs text-danger">{photoError}</p>}
      </div>
    </Card>
  )

  const details = (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle>Personal details</CardTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="firstName" label="First name"><Input id="firstName" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={inputSize} /></Field>
        <Field id="lastName" label="Last name"><Input id="lastName" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={inputSize} /></Field>
        <Field id="age" label="Age"><Input id="age" type="number" min={16} max={100} value={form.age} onChange={(e) => set('age', e.target.value)} className={inputSize} /></Field>
        <Field id="email" label="Email"><Input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputSize} /></Field>
        <Field id="years" label="Years at company" managed>
          <Input id="years" readOnly value={`${profile.yearsAtCompany} ${profile.yearsAtCompany === 1 ? 'year' : 'years'}`} className={cn(inputSize, 'bg-sunk')} />
        </Field>
        <Field id="department" label="Department" managed>
          <Input id="department" readOnly value={profile.department} className={cn(inputSize, 'bg-sunk')} />
        </Field>
      </div>
    </Card>
  )

  const vacation = (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle>Yearly vacation {year}</CardTitle>
      {!balances || !totals ? <Skeleton className="h-32" /> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Allowance" value={totals.allowance} />
            <StatTile label="Used" value={totals.used} />
            <StatTile label="Left" value={totals.allowance - totals.used} />
          </div>
          <StackedBar segments={yearlySegments(balances)} total={totals.allowance} />
          <ul className="flex flex-col gap-1.5 text-[13.5px]">
            {balances.map((b) => (
              <li key={b.type} className="flex items-center gap-2">
                <TypeSwatch type={b.type} />
                <span className="flex-1">{b.type}</span>
                <span className="text-muted-foreground"><strong className="font-semibold text-foreground">{b.used}</strong> of {b.allowance}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )

  const passwords = (
    <div className="grid gap-4 md:grid-cols-2">
      <Field id="currentPassword" label="Current password">
        <Input id="currentPassword" type="password" autoComplete="current-password" value={form.currentPassword}
          onChange={(e) => set('currentPassword', e.target.value)} className={inputSize} />
      </Field>
      <Field id="newPassword" label="New password">
        <Input id="newPassword" type="password" autoComplete="new-password" value={form.newPassword}
          onChange={(e) => set('newPassword', e.target.value)} className={inputSize} />
      </Field>
    </div>
  )

  const error = save.error && <p role="alert" className="rounded-tile bg-danger-bg px-3.5 py-3 text-[13.5px] text-danger">{save.error.message}</p>

  if (isMobile) {
    return (
      <>
        {photoCard}
        {error}
        {details}
        <Card className="flex flex-col gap-4 p-5">
          <CardTitle>Password</CardTitle>
          {passwords}
        </Card>
        {vacation}
        <Card ref={settingsRef} id="settings" className="divide-y">
          <label className="flex min-h-14 items-center justify-between gap-3 px-5 text-sm font-medium">
            Notifications
            <Switch checked={form.notifyOnChange} onCheckedChange={(v) => set('notifyOnChange', v)} aria-label="Email me when a request changes" />
          </label>
          <div className="flex min-h-14 items-center justify-between gap-3 px-5 text-sm font-medium">
            Theme
            <div className="flex rounded-md bg-sunk p-0.5" role="radiogroup" aria-label="Theme">
              {([['light', Sun, 'Light theme'], ['dark', Moon, 'Dark theme']] as const).map(([value, Icon, label]) => (
                <button key={value} type="button" role="radio" aria-checked={theme === value} aria-label={label} onClick={() => setTheme(value)}
                  className={cn('flex size-11 items-center justify-center rounded-[6px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    theme === value && 'bg-surface shadow-sm')}>
                  <Icon className="size-[18px]" aria-hidden />
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={signOut}
            className="flex min-h-14 w-full items-center gap-2 px-5 text-sm font-semibold text-danger focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <LogOut className="size-[18px]" aria-hidden />Sign out
          </button>
        </Card>
        <StickyBar>
          <Button icon={Save} label="Save changes" variant="primary" size="sticky" loading={save.isPending} disabled={!dirty} onClick={submit} />
        </StickyBar>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Profile & settings"
        actions={(
          <>
            <Button icon={RotateCcw} label="Discard" disabled={!dirty || save.isPending} onClick={() => { setForm(formFrom(profile)); save.reset() }} />
            <Button icon={Save} label="Save changes" variant="primary" loading={save.isPending} disabled={!dirty} onClick={submit} />
          </>
        )}
      />
      {error}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-5">
          {photoCard}
          {details}
        </div>
        <div className="flex flex-col gap-5">
          {vacation}
          <Card ref={settingsRef} id="settings" className="flex scroll-mt-24 flex-col gap-4 p-5">
            <CardTitle>Settings</CardTitle>
            <label className="flex items-center justify-between gap-3 text-sm">
              Email me when a request changes
              <Switch checked={form.notifyOnChange} onCheckedChange={(v) => set('notifyOnChange', v)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              Weekly leave digest
              <Switch checked={form.weeklyDigest} onCheckedChange={(v) => set('weeklyDigest', v)} />
            </label>
            <hr />
            {passwords}
          </Card>
        </div>
      </div>
    </>
  )
}

const inputSize = 'h-11 md:h-9'

function Field({ id, label, managed, children }: { id: string; label: string; managed?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {managed && <span className="font-normal text-muted-foreground">· managed by HR</span>}
      </Label>
      {children}
    </div>
  )
}
