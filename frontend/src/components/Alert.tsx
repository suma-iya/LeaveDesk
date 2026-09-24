import type { ReactNode } from 'react'
import { AlertTriangle, OctagonAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Amber warning or red error box. */
export function Alert({ tone, children, className }: { tone: 'warning' | 'error'; children: ReactNode; className?: string }) {
  const Icon = tone === 'warning' ? AlertTriangle : OctagonAlert
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-tile px-3.5 py-3 text-[13.5px]',
        tone === 'warning' ? 'bg-pending-bg text-pending' : 'bg-danger-bg text-danger', className)}>
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
