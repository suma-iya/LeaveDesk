import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { api } from '@/api'
import { keys } from '@/api/queries'
import { Alert } from '@/components/Alert'
import { AppButton } from '@/components/AppButton'
import { Input } from '@/components/ui/input'
import { ageOn } from '@/lib/format'
import { authInput } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { useAuth } from './AuthProvider'
import { AuthLayout, Field } from './AuthLayout'
import { GoogleButton } from './GoogleButton'
import { homeFor } from './homeFor'

const EMPTY = { firstName: '', lastName: '', dateOfBirth: '', email: '', password: '', confirmPassword: '' }

/** 0–4: length ≥ 8, upper + lower case, a digit, a symbol or 12+ characters. */
export function passwordStrength(pw: string) {
  if (!pw) return 0
  return [pw.length >= 8, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw) || pw.length >= 12].filter(Boolean).length
}
const STRENGTH = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']

export function RegisterPage() {
  const { signedIn } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [touched, setTouched] = useState(false)
  const bootstrap = useQuery({ queryKey: keys.bootstrap, queryFn: api.auth.bootstrap })
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const register = useMutation({
    mutationFn: () => api.auth.register(form),
    onSuccess: (user) => {
      signedIn(user)
      navigate(homeFor(user), { replace: true })
    },
  })

  const age = form.dateOfBirth ? ageOn(form.dateOfBirth) : null
  const strength = passwordStrength(form.password)
  const problems = {
    dateOfBirth: age !== null && age < 18 ? 'You must be at least 18 years old.' : undefined,
    password: form.password && form.password.length < 8 ? 'Use at least 8 characters.' : undefined,
    confirmPassword: form.confirmPassword && form.confirmPassword !== form.password ? 'The passwords do not match.' : undefined,
  }
  const complete = Object.values(form).every((v) => v.trim() !== '')
  const valid = complete && !Object.values(problems).some(Boolean)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (valid) register.mutate()
  }

  return (
    <AuthLayout title="Create an account" subtitle="You can request leave as soon as your account is created." wide>
      {bootstrap.data?.hasHR === false && (
        <Alert tone="warning" className="mb-5">
          No HR account exists yet. The first account created becomes HR.
        </Alert>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="firstName" label="First name">
            <Input id="firstName" autoComplete="given-name" required value={form.firstName} onChange={set('firstName')} className={authInput} />
          </Field>
          <Field id="lastName" label="Last name">
            <Input id="lastName" autoComplete="family-name" required value={form.lastName} onChange={set('lastName')} className={authInput} />
          </Field>
        </div>
        <Field id="dateOfBirth" label="Date of birth" error={problems.dateOfBirth}
          hint={age !== null ? `You are ${age}.` : 'You must be 18 or older.'}>
          <Input id="dateOfBirth" type="date" required value={form.dateOfBirth} onChange={set('dateOfBirth')} className={authInput}
            max={new Date().toISOString().slice(0, 10)} aria-invalid={Boolean(problems.dateOfBirth)} />
        </Field>
        <Field id="email" label="Email" hint="Use your company email.">
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} className={authInput} />
        </Field>
        <Field id="password" label="Password" error={problems.password} hint={form.password ? `Strength: ${STRENGTH[strength]}` : 'At least 8 characters.'}>
          <Input id="password" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')}
            className={authInput} aria-invalid={Boolean(problems.password)} />
          <div className="grid grid-cols-4 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={cn('h-1 rounded-full', i <= strength
                ? strength <= 1 ? 'bg-danger' : strength === 2 ? 'bg-pending' : 'bg-ok' : 'bg-sunk')} />
            ))}
          </div>
        </Field>
        <Field id="confirmPassword" label="Confirm password" error={problems.confirmPassword}>
          <Input id="confirmPassword" type="password" autoComplete="new-password" required value={form.confirmPassword}
            onChange={set('confirmPassword')} className={authInput} aria-invalid={Boolean(problems.confirmPassword)} />
        </Field>
        {touched && !complete && <Alert tone="error">Fill in every field.</Alert>}
        {register.error && <Alert tone="error">{register.error.message}</Alert>}
        <AppButton type="submit" icon={UserPlus} label="Create account" variant="primary" size="block" loading={register.isPending} />
      </form>
      {bootstrap.data?.google && <GoogleButton />}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="font-semibold text-highlight hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
