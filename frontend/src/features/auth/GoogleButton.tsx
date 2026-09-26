import { LogIn } from 'lucide-react'
import { api } from '@/api'
import { AppButton } from '@/components/AppButton'

/** Shown only when the server has Google sign-in configured. */
export function GoogleButton() {
  return (
    <>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
      <AppButton icon={LogIn} label="Continue with Google" size="block" href={api.auth.googleStartUrl} />
    </>
  )
}
