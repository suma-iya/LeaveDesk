import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'
import { Briefcase, LogIn, User } from 'lucide-react'
import { api, useMock } from '@/api'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Logo } from '@/components/Logo'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { readClaims } from '@/lib/jwt'
import { MOCK_PASSWORD } from '@/api/mockData'
import { homeFor } from './homeFor'
import { useAuth } from './AuthProvider'

const DEMO_ACCOUNTS = [
  { label: 'HR demo', icon: Briefcase, email: 'farhana.islam@leavedesk.test' },
  { label: 'Employee demo', icon: User, email: 'nusrat.jahan@leavedesk.test' },
]

export function LoginPage() {
  const { user, role, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const config = useQuery({ queryKey: ['auth-config'], queryFn: api.authConfig, staleTime: Infinity })

  const login = useMutation({
    mutationFn: (credentials: { email: string; password: string } | { credential: string }) =>
      'credential' in credentials ? api.loginWithGoogle(credentials.credential) : api.login(credentials.email, credentials.password),
    onSuccess: (session) => {
      signIn(session)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? homeFor(readClaims(session.token)?.role ?? 'employee'), { replace: true })
    },
  })

  if (user && role) return <Navigate to={homeFor(role)} replace />

  const submit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate({ email, password })
  }

  const googleClientId = config.data?.googleClientId

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-6">
        <Logo className="mb-6" />
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">Sign in</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">Request leave and follow its status.</p>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className="h-11 md:h-9" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} className="h-11 md:h-9" />
          </div>
          {login.error && <p role="alert" className="text-[13px] text-danger">{login.error.message}</p>}
          <div className="flex justify-end">
            <Button type="submit" icon={LogIn} label="Sign in" variant="primary" loading={login.isPending} />
          </div>
        </form>

        {googleClientId && (
          <div className="mt-5 flex flex-col items-center gap-3 border-t pt-5">
            <GoogleOAuthProvider clientId={googleClientId}>
              <GoogleLogin onSuccess={({ credential }) => credential && login.mutate({ credential })} text="continue_with" />
            </GoogleOAuthProvider>
          </div>
        )}

        {useMock && (
          <div className="mt-5 border-t pt-5">
            <p className="mb-2 text-xs text-muted-foreground">Demo data is on. Fill in a demo account:</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <Button key={account.email} icon={account.icon} label={account.label}
                  onClick={() => { setEmail(account.email); setPassword(MOCK_PASSWORD) }} />
              ))}
            </div>
          </div>
        )}
      </Card>
    </main>
  )
}
