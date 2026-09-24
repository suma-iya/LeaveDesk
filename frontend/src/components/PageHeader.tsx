import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { IconButton } from '@/components/Button'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Detail pages: a back icon button and a breadcrumb above a 22px title. */
  back?: { to: string; label: string }
  breadcrumb?: { label: string; to?: string }[]
}

export function PageHeader({ title, subtitle, actions, back, breadcrumb }: PageHeaderProps) {
  const detail = Boolean(back)
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {back && <IconButton icon={ArrowLeft} label={back.label} to={back.to} variant="secondary" className="hidden md:inline-flex" />}
        <div className="min-w-0">
          {breadcrumb && (
            <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
              {breadcrumb.map((crumb, i) => (
                <span key={crumb.label} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden>/</span>}
                  {crumb.to ? <Link to={crumb.to} className="hover:text-foreground hover:underline">{crumb.label}</Link>
                    : <span aria-current="page" className="text-foreground">{crumb.label}</span>}
                </span>
              ))}
            </nav>
          )}
          <h1 className={cn('font-bold tracking-[-0.02em]', detail ? 'text-[22px]' : 'text-[26px]')}>{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0 md:items-center">{actions}</div>}
    </header>
  )
}
