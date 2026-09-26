import { PageHeader } from '@/components/PageHeader'
import { HeaderActions } from '@/layouts/HeaderActions'

export function PendingPage() {
  return <PageHeader title="Pending requests" actions={<HeaderActions />} />
}
