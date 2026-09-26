import { TYPE_LABEL } from '@/lib/leave'
import { typeStyles } from '@/lib/styles'
import { cn } from '@/lib/utils'
import type { LeaveType } from '@/types'

/** 8px rounded square in the type colour. */
export function TypeSwatch({ type, className }: { type: LeaveType; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-[2px]', typeStyles[type].bg, className)} />
}

/** Swatch + type name ("Annual"). */
export function LeaveTypeTag({ type, className }: { type: LeaveType; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap', className)}>
      <TypeSwatch type={type} />
      {TYPE_LABEL[type]}
    </span>
  )
}
