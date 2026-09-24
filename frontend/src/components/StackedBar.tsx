import { typeStyles } from '@/lib/styles'
import { cn } from '@/lib/utils'
import type { LeaveType } from '@/types'

interface Segment {
  type: LeaveType | 'pending'
  days: number
}

/** 6px bar: one segment per type in its colour, pending as amber stripes. */
export function StackedBar({ segments, total, className }: { segments: Segment[]; total: number; className?: string }) {
  return (
    <div className={cn('flex h-1.5 overflow-hidden rounded-full bg-sunk', className)} aria-hidden>
      {segments.filter((s) => s.days > 0).map((segment) => (
        <div
          key={segment.type}
          className={segment.type === 'pending' ? 'pending-stripes' : typeStyles[segment.type].bg}
          style={{ width: `${total > 0 ? (segment.days / total) * 100 : 0}%` }}
        />
      ))}
    </div>
  )
}
