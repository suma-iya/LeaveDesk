import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SearchFilter {
  kind: 'search'
  id: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}

export interface SelectFilter {
  kind: 'select'
  id: string
  label: string
  value: string
  defaultValue: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

export type FilterDef = SearchFilter | SelectFilter

export function SearchInput({ filter, className }: { filter: SearchFilter; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={filter.value}
        onChange={(e) => filter.onChange(e.target.value)}
        placeholder={filter.placeholder}
        aria-label={filter.placeholder}
        className="h-full rounded-md bg-surface pl-9 text-sm"
      />
    </div>
  )
}

export function FilterSelect({ filter, className }: { filter: SelectFilter; className?: string }) {
  return (
    <Select value={filter.value} onValueChange={filter.onChange}>
      <SelectTrigger aria-label={filter.label} className={cn('rounded-md bg-surface text-sm', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {filter.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Shared option lists for the filter selects. */
export const ALL = 'all'

export const optionsFrom = (allLabel: string, values: string[]) => [
  { value: ALL, label: allLabel },
  ...values.map((v) => ({ value: v, label: v })),
]
