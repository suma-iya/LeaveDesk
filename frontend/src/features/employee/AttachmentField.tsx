import { useRef, useState, type DragEvent } from 'react'
import { Paperclip, Upload, X } from 'lucide-react'
import { AppButton, IconButton } from '@/components/AppButton'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { FileMeta } from '@/types'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/api'

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = 'application/pdf,image/png,image/jpeg'

/** Checked in the browser for quick feedback; the server checks again. */
function checkAttachment(file: File): string | null {
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) return 'Attach a PDF, PNG or JPG.'
  if (file.size > MAX_BYTES) return `The file is ${formatBytes(file.size)}; the limit is 5 MB.`
  return null
}

/** Dashed dropzone with an Upload button; shows the file once attached. */
export function AttachmentField({ value, onChange }: { value?: FileMeta | null; onChange: (a: FileMeta | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useMutation({ mutationFn: (file: File) => api.files.upload('attachment', file) })
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const accept = (file: File | undefined) => {
    if (!file) return
    const problem = checkAttachment(file)
    setError(problem)
    if (problem) return
    upload.mutate(file, { onSuccess: onChange, onError: (e) => setError(e.message) })
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    accept(event.dataTransfer.files[0])
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-tile border bg-sunk px-3 py-2">
        <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13.5px]">
          <span className="font-semibold">{value.name}</span>
          <span className="text-muted-foreground"> · {formatBytes(value.sizeBytes)}</span>
        </span>
        <IconButton icon={X} label="Remove attachment" variant="ghost" onClick={() => onChange(null)} />
      </div>
    )
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn('flex flex-col items-start gap-3 rounded-tile border-[1.5px] border-dashed p-4 sm:flex-row sm:items-center',
          dragging && 'border-highlight bg-highlight-soft')}
      >
        <p className="flex-1 text-[13px] text-muted-foreground">
          <strong className="font-semibold text-foreground">Attachment (optional)</strong> · PDF, PNG or JPG, max 5 MB
        </p>
        <AppButton icon={Upload} label="Upload" loading={upload.isPending} onClick={() => input.current?.click()} />
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => { accept(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      {error && <p role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p>}
    </div>
  )
}
