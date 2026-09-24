import { useState, type ReactNode } from 'react'
import {
  flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type OnChangeFn, type RowData, type RowSelectionState, type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { Button, IconButton } from '@/components/Button'
import { Card, CardTitle } from '@/components/Card'
import { FilterSelect, SearchInput, type FilterDef, type SelectFilter } from '@/components/Filters'
import { EmptyState, ErrorState } from '@/components/States'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Classes for both the header and body cells of this column. */
    className?: string
  }
}

const PAGE_SIZES = [8, 16, 32]

export interface DataTableProps<T> {
  title?: string
  filters?: FilterDef[]
  onReset?: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  data: T[] | undefined
  isLoading: boolean
  error?: unknown
  onRetry?: () => void
  getRowId: (row: T) => string
  emptyMessage: string
  emptyAction?: ReactNode
  /** Adds a checkbox column (desktop only). */
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  /** Shown above the header while rows are selected. */
  bulkBar?: ReactNode
  /** The card that replaces a row below 768px. */
  renderCard: (row: T) => ReactNode
  initialSorting?: SortingState
}

/**
 * The one table pattern used by every list page: toolbar with filters,
 * sortable TanStack Table, pagination footer. On mobile the same rows render
 * as cards, filters move into a bottom sheet and show as removable chips.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const { columns, data, getRowId, rowSelection, onRowSelectionChange, initialSorting = [] } = props
  const isMobile = useIsMobile()
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZES[0] })
  const selectable = Boolean(onRowSelectionChange) && !isMobile

  const table = useReactTable({
    data: data ?? [],
    columns: selectable ? [selectColumn<T>(), ...columns] : columns,
    getRowId,
    state: { sorting, pagination, rowSelection: rowSelection ?? {} },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange,
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const total = data?.length ?? 0
  const first = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const last = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize)
  const pageCount = Math.max(1, table.getPageCount())

  const body = props.error ? <ErrorState error={props.error} onRetry={props.onRetry} />
    : !props.isLoading && total === 0 ? <EmptyState message={props.emptyMessage} action={props.emptyAction} />
    : null

  if (isMobile) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {props.title && <CardTitle className="mr-auto">{props.title}</CardTitle>}
          {total > 0 && (
            <div className={cn('flex items-center gap-2', !props.title && 'ml-auto')}>
              <span className="text-[13px] text-muted-foreground">{first}–{last} of {total}</span>
              <IconButton icon={ChevronLeft} label="Previous page" variant="secondary"
                disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} />
              <IconButton icon={ChevronRight} label="Next page" variant="secondary"
                disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} />
            </div>
          )}
        </div>
        {props.filters && props.filters.length > 0 && <MobileFilters filters={props.filters} onReset={props.onReset} />}
        {body ?? (
          <ul className="flex flex-col gap-3">
            {props.isLoading
              ? Array.from({ length: 3 }, (_, i) => <li key={i}><Skeleton className="h-28 w-full rounded-card" /></li>)
              : table.getRowModel().rows.map((row) => <li key={row.id}>{props.renderCard(row.original)}</li>)}
          </ul>
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
          {props.onReset && <Button icon={RotateCcw} label="Reset" variant="ghost" onClick={props.onReset} />}
        </div>
      )}
      {props.bulkBar && <div className="flex flex-wrap items-center gap-2 border-b bg-sunk px-4 py-2.5">{props.bulkBar}</div>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      className={cn('h-[42px] px-4 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground', header.column.columnDef.meta?.className)}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon className={cn('size-3', !sorted && 'opacity-50')} aria-hidden />
                        </button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          {!body && (
            <tbody>
              {props.isLoading
                ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="h-14 border-b last:border-0">
                    <td colSpan={table.getAllLeafColumns().length} className="px-4"><Skeleton className="h-6 w-full" /></td>
                  </tr>
                ))
                : table.getRowModel().rows.map((row) => (
                  <tr key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}
                    className="h-14 border-b transition-colors last:border-0 hover:bg-sunk data-[state=selected]:bg-sunk">
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
            <Select value={String(pagination.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger aria-label="Rows per page" className="h-9! w-[72px] rounded-md bg-surface"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </span>
          <Button icon={ChevronLeft} label="Previous" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} />
          <span className="whitespace-nowrap text-foreground">Page {pagination.pageIndex + 1} of {pageCount}</span>
          <Button icon={ChevronRight} label="Next" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} />
        </footer>
      )}
    </Card>
  )
}

function selectColumn<T>(): ColumnDef<T> {
  return {
    id: 'select',
    enableSorting: false,
    meta: { className: 'w-10 pr-0' },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on this page"
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(value === true)} />
    ),
  }
}

/** Mobile: search next to a Filters button; selects live in a bottom sheet. */
function MobileFilters({ filters, onReset }: { filters: FilterDef[]; onReset?: () => void }) {
  const [open, setOpen] = useState(false)
  const search = filters.find((f) => f.kind === 'search')
  const selects = filters.filter((f): f is SelectFilter => f.kind === 'select')
  const active = selects.filter((f) => f.value !== f.defaultValue)

  return (
    <>
      <div className="flex items-center gap-2">
        {search ? <SearchInput filter={search} className="h-11 flex-1" /> : <span className="flex-1" />}
        {selects.length > 0 && (
          <IconButton icon={SlidersHorizontal} label="Filters" variant="secondary" onClick={() => setOpen(true)} />
        )}
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {active.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => filter.onChange(filter.defaultValue)}
              aria-label={`Remove filter ${filter.options.find((o) => o.value === filter.value)?.label}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-2.5 text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {filter.options.find((o) => o.value === filter.value)?.label}
              <X className="size-3.5 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-card bg-header">
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
            {onReset && (
              <div className="grid grid-cols-2 gap-2">
                <Button icon={RotateCcw} label="Reset" variant="secondary" onClick={onReset} />
                <Button icon={SlidersHorizontal} label="Show results" variant="primary" onClick={() => setOpen(false)} />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
