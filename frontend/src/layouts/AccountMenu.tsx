import { Link } from 'react-router-dom'
import { LogOut, UserRound } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { fullName } from '@/lib/format'
import { cn } from '@/lib/utils'

/** 34px avatar at the bottom of the rail: profile, sign out. */
export function AccountMenu({ side = 'right', className }: { side?: 'right' | 'top'; className?: string }) {
  const user = useUser()
  const { signOut } = useAuth()
  const name = fullName(user)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Account menu"
        className={cn('rounded-full max-md:p-[5px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail focus-visible:outline-none', className)}>
        <Avatar name={name} src={user.avatarUrl} size={34} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" sideOffset={8} className="w-[260px] rounded-card p-1.5 shadow-lg">
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
          <Avatar name={name} src={user.avatarUrl} size={40} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="h-9 gap-2.5">
          <Link to="/profile"><UserRound className="size-4" />My profile</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()} className="h-9 gap-2.5 text-danger focus:bg-danger-bg focus:text-danger">
          <LogOut className="size-4 text-danger" />Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
