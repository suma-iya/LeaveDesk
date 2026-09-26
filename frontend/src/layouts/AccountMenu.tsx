import { Link } from 'react-router-dom'
import { ChevronsUpDown, LogOut, UserRound } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { ROLE_LABEL, fullName } from '@/lib/format'
import { cn } from '@/lib/utils'

const focusRing = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail focus-visible:outline-none'

/**
 * The account menu (profile, sign out) and its trigger:
 *  - expanded sidebar: a 52px card (avatar, name, role · department); the
 *    menu opens above it at the card's width.
 *  - collapsed sidebar: the 32px avatar with the name in a tooltip; the menu
 *    opens to its right.
 *  - mobile tab bar: the 34px avatar; the menu opens above it.
 */
export function AccountMenu({ layout, className }: { layout: 'expanded' | 'collapsed' | 'mobile'; className?: string }) {
  const user = useUser()
  const { signOut } = useAuth()
  const name = fullName(user)
  const triggerProps = { 'aria-label': `Account menu for ${name}`, 'aria-haspopup': 'menu' as const }

  const trigger = layout === 'expanded' ? (
    <DropdownMenuTrigger {...triggerProps}
      className={cn('flex h-[52px] w-full items-center gap-2.5 rounded-tile border bg-surface px-2.5 text-left transition-colors hover:bg-soft-hover', focusRing, className)}>
      <Avatar name={name} src={user.avatarUrl} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-foreground">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {ROLE_LABEL[user.role]} · {user.department?.name ?? 'No department yet'}
        </span>
      </span>
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </DropdownMenuTrigger>
  ) : (
    <DropdownMenuTrigger {...triggerProps} className={cn('rounded-full', layout === 'mobile' && 'max-md:p-[5px]', focusRing, className)}>
      <Avatar name={name} src={user.avatarUrl} size={layout === 'mobile' ? 34 : 32} />
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {layout === 'collapsed' ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">{name}</TooltipContent>
        </Tooltip>
      ) : trigger}
      <DropdownMenuContent
        side={layout === 'collapsed' ? 'right' : 'top'}
        align={layout === 'expanded' ? 'start' : 'end'}
        sideOffset={8}
        // Expanded keeps the default width: the trigger's (--radix-dropdown-menu-trigger-width).
        className={cn('rounded-card p-1.5 shadow-lg', layout !== 'expanded' && 'w-[260px]')}>
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
