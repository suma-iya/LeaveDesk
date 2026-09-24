import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Icon, muted label, value — used on the employee card and profile. */
export function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 text-[13.5px]">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  )
}
