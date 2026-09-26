import { TypeSwatch } from '@/components/LeaveTypeTag'
import { LEAVE_TYPES, TYPE_LABEL } from '@/lib/leave'
import { cn } from '@/lib/utils'
import type { LeaveType } from '@/types'

/** Segmented control: 3 equal cells on a --sunk track, "N available" under each. */
export function TypePicker({ value, onChange, availableByType }: {
  value: LeaveType; onChange: (type: LeaveType) => void; availableByType: Record<LeaveType, number>
}) {
  return (
    <div role="radiogroup" aria-label="Leave type" className="grid grid-cols-3 gap-1 rounded-md bg-sunk p-1">
      {LEAVE_TYPES.map((type) => (
        <button key={type} type="button" role="radio" aria-checked={value === type} onClick={() => onChange(type)}
          className={cn(
            'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[6px] px-2 py-1.5 text-[13.5px] font-semibold transition-colors',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            value === type ? 'bg-surface shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}>
          <span className="flex items-center gap-1.5"><TypeSwatch type={type} />{TYPE_LABEL[type]}</span>
          <span className="text-[11.5px] font-medium text-muted-foreground">{availableByType[type]} available</span>
        </button>
      ))}
    </div>
  )
}
