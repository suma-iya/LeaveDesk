import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'
import { CalendarCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

const DEMO_ACCOUNTS = [
  { label: 'Manager', email: 'manager@example.com', password: 'manager123' },
  { label: 'Employee', email: 'alice@example.com', password: 'password123' },
]

export default function LoginPage() {
  const { user, login, loginWithGoogle, googleClientId } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/" replace />

  // After login go back to the page the user originally asked for.
  const afterLogin = () => navigate(location.state?.from?.pathname ?? '/', { replace: true })

  async function run(action) {
    setSubmitting(true)
    setError('')
    try {
      await action()
      afterLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CalendarCheck className="mx-auto mb-2 size-8 text-primary" />
          <CardTitle className="text-xl">Employee Leave Tracker</CardTitle>
          <CardDescription>Sign in to manage your leave</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => login(email, password)) }}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {googleClientId && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Separator className="flex-1" /> or <Separator className="flex-1" />
              </div>
              {/* Google shows its own button; on success it gives us an ID token
                  ("credential") which we send to our backend to verify. */}
              <GoogleOAuthProvider clientId={googleClientId}>
                <div className="flex justify-center">
                  <GoogleLogin
                    onSuccess={({ credential }) => run(() => loginWithGoogle(credential))}
                    onError={() => setError('Google sign-in was cancelled or failed.')}
                    text="continue_with"
                    width="320"
                  />
                </div>
              </GoogleOAuthProvider>
            </>
          )}
        </CardContent>

        <CardFooter className="flex-col items-stretch gap-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">Demo accounts (click to fill):</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button key={account.email} variant="outline" size="sm" type="button"
                onClick={() => { setEmail(account.email); setPassword(account.password) }}>
                {account.label}
              </Button>
            ))}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
