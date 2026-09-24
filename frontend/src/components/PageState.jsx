import { AlertCircle, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function LoadingState({ rows = 3 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
      <AlertCircle className="size-6 text-destructive" />
      <p className="text-sm text-destructive">{error?.message ?? 'Something went wrong.'}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function EmptyState({ title, description }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <Inbox className="size-6 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}
