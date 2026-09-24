import { Home } from 'lucide-react'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/States'

export function NotFoundPage() {
  return <EmptyState message="This page does not exist." action={<Button icon={Home} label="Go home" to="/" />} />
}
