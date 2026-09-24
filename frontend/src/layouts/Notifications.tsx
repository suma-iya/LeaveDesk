import { Bell } from 'lucide-react'
import { IconButton } from '@/components/Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function Notifications() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={Bell} label="Notifications" variant="ghost" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-card p-4 text-sm text-muted-foreground shadow-lg">
        You’re all caught up.
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
