import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'

/** Auth pages have no rail: a centred 16px-radius card with the logo above. */
export function AuthLayout({ title, subtitle, children, wide = false }: { title: string; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Logo withName />
      <section className={`w-full rounded-dialog border bg-surface p-6 sm:p-8 ${wide ? 'max-w-lg' : 'max-w-md'}`}>
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </section>
    </main>
  )
}

/** Label + control + optional hint/error, stacked. */
export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className="text-xs text-danger">{error}</p>
        : hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
