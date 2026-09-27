import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { IconButton } from '@/components/AppButton'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: ReactNode
  /** List pages: Request leave · calendar · theme · Export (in that order). */
  actions?: ReactNode
  /** Detail and form pages: back icon button + breadcrumb, 22px title. */
  back?: { to: string; label: string }
  breadcrumb?: { label: string; to?: string }[]
  /** Next to the title on detail pages (e.g. a status badge). */
  titleAside?: ReactNode
}

export function PageHeader({ title, actions, back, breadcrumb, titleAside }: PageHeaderProps) {
  const detail = Boolean(back)
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {back && <IconButton icon={ArrowLeft} label={back.label} to={back.to} variant="secondary" />}
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={cn('font-bold tracking-[-0.02em]', detail ? 'text-[22px]' : 'text-[26px]')}>{title}</h1>
            {titleAside}
          </div>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 max-md:[&>*:first-child]:flex-1">{actions}</div>}
    </header>
  )
}
