import { Home } from 'lucide-react'
import { AppButton } from '@/components/AppButton'
import { EmptyState } from '@/components/States'

export function NotFoundPage() {
  return <EmptyState message="This page does not exist." action={<AppButton icon={Home} label="Go home" to="/" />} />
}
