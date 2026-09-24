import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-semibold">404</p>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Button asChild><Link to="/">Go home</Link></Button>
    </div>
  )
}
