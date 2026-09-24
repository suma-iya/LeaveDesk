import { Leaf } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 30px rounded square in --primary with a Leaf, then "LeaveDesk". */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex size-[30px] items-center justify-center rounded-lg bg-primary text-on-primary">
        <Leaf className="size-4" aria-hidden />
      </span>
      <span className="text-[15px] font-bold">LeaveDesk</span>
    </span>
  )
}
