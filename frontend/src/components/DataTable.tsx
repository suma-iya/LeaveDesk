import { useState, type ReactNode } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowData } from '@tanstack/react-table'
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { AppButton, IconButton } from '@/components/AppButton'
import { Card, CardTitle } from '@/components/Card'
import { FilterSelect, SearchInput, type FilterDef, type SelectFilter } from '@/components/Filters'
import { Pagination } from '@/components/Pagination'
import { EmptyState, ErrorState } from '@/components/States'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/lib/useIsMobile'
import { PAGE_SIZES } from '@/lib/usePaging'
import { cn } from '@/lib/utils'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Classes for both the header and body cells of this column. */
    className?: string
  }
}

export interface DataTableProps<T> {
  title?: string
  filters?: FilterDef[]
  onReset?: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  rows: T[] | undefined
  /** Server-side paging: the API returns one page plus the total count. */
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  isLoading: boolean
  error?: unknown
  onRetry?: () => void
  getRowId: (row: T) => string
  emptyMessage: string
  /** The card that replaces a row below 768px. */
  renderCard: (row: T) => ReactNode
}

/**
 * The one table pattern for every list page: a card with a filter toolbar,
 * a TanStack Table, and a footer with "Showing 1–10 of 23", rows per page
 * (10 / 20 / 40) and ‹ Page 1 of 3 › (Pagination). Below 768px rows become
 * cards and filters move into a bottom sheet shown as removable chips.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const isMobile = useIsMobile()
  // The React Compiler can't memoise TanStack Table's API; this component
  // doesn't rely on memoisation, so the warning doesn't apply here.
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: props.rows ?? [],
    columns: props.columns,
    getRowId: props.getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  })

  const { total, page, pageSize } = props
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)

  const body = props.error ? <ErrorState error={props.error} onRetry={props.onRetry} />
    : !props.isLoading && total === 0 ? <EmptyState message={props.emptyMessage} />
    : null

  if (isMobile) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {props.title && <CardTitle className="mr-auto">{props.title}</CardTitle>}
          {props.filters && !props.filters.some((f) => f.kind === 'search') && (
            <div className={cn(!props.title && 'ml-auto')}>
              <MobileFilters filters={props.filters} onReset={props.onReset} part="button" />
            </div>
          )}
        </div>
        {props.filters && props.filters.length > 0 && (
          <MobileFilters filters={props.filters} onReset={props.onReset}
            part={props.filters.some((f) => f.kind === 'search') ? 'all' : 'chips'} />
        )}
        {body ?? (
          <ul className="flex flex-col gap-3">
            {props.isLoading && !props.rows
              ? Array.from({ length: 3 }, (_, i) => <li key={i}><Skeleton className="h-28 w-full rounded-card" /></li>)
              : table.getRowModel().rows.map((row) => <li key={row.id}>{props.renderCard(row.original)}</li>)}
          </ul>
        )}
        {total > 0 && (
          <footer className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="mr-auto">{first}–{last} of {total}</span>
            <PageSizeSelect value={pageSize} onChange={props.onPageSizeChange} />
            <Pagination page={page} pageCount={pageCount} onPageChange={props.onPageChange} />
          </footer>
        )}
      </section>
    )
  }

  return (
    <Card className="overflow-hidden">
      {(props.title || props.filters) && (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          {props.title && <CardTitle className="mr-auto">{props.title}</CardTitle>}
          {props.filters?.map((filter) => filter.kind === 'search'
            ? <SearchInput key={filter.id} filter={filter} className={cn('h-9 w-60', !props.title && 'mr-auto')} />
            : <FilterSelect key={filter.id} filter={filter} className="h-9! w-[160px]" />)}
          {props.onReset && <AppButton icon={RotateCcw} label="Reset" variant="ghost" onClick={props.onReset} />}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b">
                {group.headers.map((header) => (
                  <th key={header.id} scope="col"
                    className={cn('h-[42px] px-4 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground', header.column.columnDef.meta?.className)}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          {!body && (
            <tbody>
              {props.isLoading && !props.rows
                ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="h-14 border-b last:border-0">
                    <td colSpan={props.columns.length} className="px-4"><Skeleton className="h-6 w-full" /></td>
                  </tr>
                ))
                : table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="h-14 border-b transition-colors last:border-0 hover:bg-sunk">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cn('px-4 py-2', cell.column.columnDef.meta?.className)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          )}
        </table>
      </div>
      {body}

      {total > 0 && (
        <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-3 text-[13px] text-muted-foreground">
          <span className="mr-auto">Showing {first}–{last} of {total}</span>
          <span className="flex items-center gap-2">
            Rows per page
            <PageSizeSelect value={pageSize} onChange={props.onPageSizeChange} />
          </span>
          <Pagination page={page} pageCount={pageCount} onPageChange={props.onPageChange} showPageOf className="gap-3" />
        </footer>
      )}
    </Card>
  )
}

/** Rows per page: 10, 20 or 40. */
function PageSizeSelect({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger aria-label="Rows per page" className="h-9! w-[76px] rounded-md bg-surface max-md:h-11!"><SelectValue /></SelectTrigger>
      <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
    </Select>
  )
}

/**
 * Mobile: search next to a 44px Filters button; selects live in a bottom
 * sheet and active ones show as removable chips. Without a search box the
 * button moves into the title row (part="button") and only chips render here.
 */
function MobileFilters({ filters, onReset, part = 'all' }: { filters: FilterDef[]; onReset?: () => void; part?: 'all' | 'button' | 'chips' }) {
  const [open, setOpen] = useState(false)
  const search = filters.find((f) => f.kind === 'search')
  const selects = filters.filter((f): f is SelectFilter => f.kind === 'select')
  const active = selects.filter((f) => f.value !== f.defaultValue)
  const button = selects.length > 0 && (
    <IconButton icon={SlidersHorizontal} label="Filters" variant="secondary" onClick={() => setOpen(true)} />
  )

  return (
    <>
      {part === 'button' && button}
      {part === 'all' && (
        <div className="flex items-center gap-2">
          {search ? <SearchInput filter={search} className="h-11 flex-1" /> : <span className="flex-1" />}
          {button}
        </div>
      )}
      {part !== 'button' && active.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {active.map((filter) => {
            const label = filter.options.find((o) => o.value === filter.value)?.label
            return (
              <button key={filter.id} type="button" onClick={() => filter.onChange(filter.defaultValue)} aria-label={`Remove filter ${label}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-2.5 text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {label}
                <X className="size-3.5 text-muted-foreground" aria-hidden />
              </button>
            )
          })}
        </div>
      )}
      {part !== 'chips' && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" showCloseButton={false} className="rounded-t-dialog bg-rail">
            <SheetHeader className="flex-row items-center justify-between">
              <div>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Narrow down the list.</SheetDescription>
              </div>
              <IconButton icon={X} label="Close filters" variant="ghost" onClick={() => setOpen(false)} />
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              {selects.map((filter) => (
                <label key={filter.id} className="flex flex-col gap-1.5 text-[13px] font-medium">
                  {filter.label}
                  <FilterSelect filter={filter} className="h-11! w-full" />
                </label>
              ))}
              <div className="grid grid-cols-2 gap-2">
                {onReset ? <AppButton icon={RotateCcw} label="Reset" onClick={onReset} /> : <span />}
                <AppButton icon={SlidersHorizontal} label="Show results" variant="primary" onClick={() => setOpen(false)} />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
