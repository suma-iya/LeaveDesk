import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { fullName } from '@/lib/format'
import type { Person } from '@/types'

/** Avatar, name (optionally a link) and department, for HR table rows. */
export function PersonCell({ person, size = 32, to }: { person: Person; size?: number; to?: string }) {
  const name = fullName(person)
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={name} src={person.avatarUrl} size={size} />
      <span className="min-w-0">
        {to ? <Link to={to} className="block truncate font-semibold hover:underline">{name}</Link>
          : <span className="block truncate font-semibold">{name}</span>}
        <span className="block truncate text-xs text-muted-foreground">{person.department?.name ?? 'No department'}</span>
      </span>
    </span>
  )
}
