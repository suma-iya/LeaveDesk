import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STYLES = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
}

export function StatusBadge({ status }) {
  return <Badge className={cn('capitalize', STYLES[status])}>{status.toLowerCase()}</Badge>
}
