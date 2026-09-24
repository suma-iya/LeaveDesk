import { CheckCircle2, Clock, X } from 'lucide-react'
import { statusStyles } from '@/lib/styles'
import { cn } from '@/lib/utils'
import type { Status } from '@/types'

const icons = { pending: Clock, approved: CheckCircle2, rejected: X }

/** Pill with a 13px icon. Text is lowercase in the DOM and capitalised by CSS. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const Icon = icons[status]
  return (
    <span
      className={cn(
        'inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold capitalize',
        statusStyles[status].pill,
        className,
      )}
    >
      <Icon className="size-[13px]" aria-hidden />
      {status}
    </span>
  )
}
