import { Avatar as AvatarRoot, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface AvatarProps {
  name: string
  src?: string
  /** Diameter in px: 32–36 tables, 40 menus/lists, 56–60 mobile details, 88–96 profile. */
  size?: number
  className?: string
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')

/** Circular photo; falls back to initials on a tinted circle. Same style everywhere. */
export function Avatar({ name, src, size = 36, className }: AvatarProps) {
  return (
    <AvatarRoot
      className={cn('shrink-0 after:hidden', className)}
      style={{ width: size, height: size }}
    >
      {src && <AvatarImage src={src} alt={name} className="object-cover" />}
      <AvatarFallback
        className="bg-highlight-soft font-semibold text-highlight"
        style={{ fontSize: Math.max(10, Math.round(size * 0.38)) }}
      >
        {initials(name)}
      </AvatarFallback>
    </AvatarRoot>
  )
}
