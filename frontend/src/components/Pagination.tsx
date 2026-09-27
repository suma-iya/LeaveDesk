import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/AppButton'
import { cn } from '@/lib/utils'

/**
 * Previous / Next page as chevron icon buttons (aria-label and tooltip
 * "Previous page" / "Next page"), optionally with "Page 1 of 3" between
 * them. Previous is disabled on the first page, Next on the last.
 */
export function Pagination({ page, pageCount, onPageChange, showPageOf = false, className }: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  showPageOf?: boolean
  className?: string
}) {
  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-2', className)}>
      <IconButton icon={ChevronLeft} label="Previous page" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)} />
      {showPageOf && <span className="whitespace-nowrap text-foreground">Page {page} of {pageCount}</span>}
      <IconButton icon={ChevronRight} label="Next page" variant="secondary" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} />
    </nav>
  )
}
