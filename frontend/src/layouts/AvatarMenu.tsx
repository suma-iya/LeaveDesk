import { Link } from 'react-router-dom'
import { ChevronDown, LogOut, Moon, Settings, Sun, UserRound } from 'lucide-react'
import { Avatar } from '@/components/Avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { useTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
]

/** The only way to reach the profile page. */
export function AvatarMenu() {
  const user = useUser()
  const { signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const name = `${user.firstName} ${user.lastName}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 hover:bg-soft-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Avatar name={name} src={user.avatarUrl} size={34} />
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[260px] rounded-card p-1.5 shadow-lg">
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
        <DropdownMenuItem asChild className="h-9 gap-2.5">
          <Link to="/profile#settings"><Settings className="size-4" />Settings</Link>
        </DropdownMenuItem>
        <div className="flex items-center justify-between px-2 py-1.5 text-sm">
          Theme
          <div className="flex rounded-md bg-sunk p-0.5" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem
                key={value}
                role="menuitemradio"
                aria-checked={theme === value}
                aria-label={label}
                onSelect={(event) => { event.preventDefault(); setTheme(value) }}
                className={cn('h-7 w-9 justify-center rounded-[6px] p-0 focus:bg-soft-hover',
                  theme === value && 'bg-surface shadow-sm focus:bg-surface')}
              >
                <Icon className="size-4" />
              </DropdownMenuItem>
            ))}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} className="h-9 gap-2.5 text-danger focus:bg-danger-bg focus:text-danger">
          <LogOut className="size-4 text-danger" />Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
