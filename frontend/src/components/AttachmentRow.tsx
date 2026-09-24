import { Download, Paperclip } from 'lucide-react'
import { IconButton } from '@/components/Button'
import { formatBytes } from '@/lib/format'
import type { Attachment } from '@/types'

/** Paperclip, "file.pdf · 84 KB", download icon button. */
export function AttachmentRow({ attachment }: { attachment: Attachment }) {
  return (
    <div className="flex items-center gap-3 rounded-tile border bg-sunk px-3 py-2">
      <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[13.5px]">
        <span className="font-semibold">{attachment.name}</span>
        <span className="text-muted-foreground"> · {formatBytes(attachment.sizeBytes)}</span>
      </span>
      <IconButton icon={Download} label={`Download ${attachment.name}`} variant="ghost" href={attachment.url} download={attachment.name} />
    </div>
  )
}
