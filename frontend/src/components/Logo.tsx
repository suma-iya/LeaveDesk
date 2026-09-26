import { Leaf } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 32px rounded square in --primary with a Leaf; optional wordmark. */
export function Logo({ withName = false, className }: { withName?: boolean; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
        <Leaf className="size-4" aria-hidden />
      </span>
      {withName && <span className="text-[15px] font-bold">LeaveDesk</span>}
    </span>
  )
}
