import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LogIn } from 'lucide-react'
import { api } from '@/api'
import { keys } from '@/api/queries'
import { Alert } from '@/components/Alert'
import { AppButton } from '@/components/AppButton'
import { Input } from '@/components/ui/input'
import { authInput } from '@/lib/styles'
import { useAuth } from './AuthProvider'
import { AuthLayout, Field } from './AuthLayout'
import { GoogleButton } from './GoogleButton'
import { homeFor } from './homeFor'

export function SignInPage() {
  const { signedIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const bootstrap = useQuery({ queryKey: keys.bootstrap, queryFn: api.auth.bootstrap })

  const login = useMutation({
    mutationFn: () => api.auth.login(email, password),
    onSuccess: (user) => {
      signedIn(user)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? homeFor(user), { replace: true })
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate()
  }
  // Google sends failures back as /login?error=...
  const error = login.error?.message ?? params.get('error')

  return (
    <AuthLayout title="Sign in">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field id="email" label="Email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={authInput} />
        </Field>
        <Field id="password" label="Password">
          <Input id="password" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className={authInput} />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <AppButton type="submit" icon={LogIn} label="Sign in" variant="primary" size="block" loading={login.isPending} />
      </form>
      {bootstrap.data?.google && <GoogleButton />}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here? <Link to="/register" className="font-semibold text-highlight hover:underline">Create an account</Link>
      </p>
    </AuthLayout>
  )
}
