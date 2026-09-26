import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, Download, ExternalLink, Paperclip, ZoomIn, ZoomOut } from 'lucide-react'
import { IconButton } from '@/components/AppButton'
import { Card } from '@/components/Card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { FileMeta } from '@/types'

// pdf.js parses PDFs in a web worker; Vite bundles the worker file.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const PAGE_WIDTH = 440

/**
 * In-page preview: toolbar (zoom, open, download), the page on a --sunk
 * viewer, and page navigation. Images use the same card with an <img>.
 * Loaded lazily so react-pdf is only downloaded when a request has a file.
 */
export default function AttachmentPreview({ attachment, className }: { attachment: FileMeta; className?: string }) {
  const isPdf = attachment.mime === 'application/pdf'
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(2) // index into ZOOMS → 100%

  const meta = [isPdf ? 'PDF' : attachment.mime.split('/')[1]?.toUpperCase(), formatBytes(attachment.sizeBytes),
    isPdf && pages ? `${pages} ${pages === 1 ? 'page' : 'pages'}` : null].filter(Boolean).join(' · ')

  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold">{attachment.name}</p>
          <p className="text-xs text-muted-foreground">{meta}</p>
        </div>
        <IconButton icon={ZoomOut} label="Zoom out" variant="ghost" disabled={zoom === 0} onClick={() => setZoom((z) => z - 1)} />
        <span className="w-11 text-center text-xs font-semibold tabular-nums" aria-live="polite">{Math.round(ZOOMS[zoom] * 100)}%</span>
        <IconButton icon={ZoomIn} label="Zoom in" variant="ghost" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => z + 1)} />
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <IconButton icon={ExternalLink} label="Open in new tab" variant="ghost" href={attachment.url} target="_blank" />
        <IconButton icon={Download} label="Download" variant="ghost" href={attachment.url} download={attachment.name} />
      </div>

      <div className="flex max-h-[640px] min-h-[420px] flex-1 justify-center overflow-auto bg-sunk p-4">
        {isPdf ? (
          <Document
            file={attachment.url}
            onLoadSuccess={({ numPages }) => setPages(numPages)}
            loading={<Skeleton className="h-[560px] w-[400px]" />}
            error={<p className="self-center text-sm text-danger">This PDF could not be displayed. Try Download instead.</p>}
          >
            <Page pageNumber={page} width={PAGE_WIDTH * ZOOMS[zoom]} renderTextLayer={false} renderAnnotationLayer={false}
              className="shadow-sm [&_canvas]:rounded-sm" />
          </Document>
        ) : (
          <img src={attachment.url} alt={attachment.name} className="h-fit rounded-sm bg-surface object-contain shadow-sm"
            style={{ width: PAGE_WIDTH * ZOOMS[zoom] }} />
        )}
      </div>

      {isPdf && pages > 0 && (
        <div className="flex items-center justify-center gap-3 border-t px-3 py-2 text-[13px]">
          <IconButton icon={ChevronLeft} label="Previous page" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} />
          <span className="tabular-nums">Page {page} of {pages}</span>
          <IconButton icon={ChevronRight} label="Next page" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} />
        </div>
      )}
    </Card>
  )
}
