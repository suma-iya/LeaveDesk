import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cva } from 'class-variance-authority'
import { Loader2, type LucideIcon } from 'lucide-react'
import { Button as ShadcnButton } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'

// The ONLY button in the app. Two shapes:
//  - labeled: icon + text. Desktop is always exactly 140×36; mobile fills its
//    grid cell at 44px; sticky bottom actions are 48px.
//  - icon: square, 36 desktop / 44 mobile, always with aria-label + tooltip.
// Sizes are fixed here so no page can drift from the spec.

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'ok' | 'danger'
export type ButtonSize = 'desktop' | 'mobile' | 'sticky'

const buttonStyles = cva(
  [
    'rounded-md border border-transparent font-semibold transition-colors',
    'focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-45',
    'active:translate-y-px',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-hover',
        secondary: 'border-border bg-surface text-foreground hover:bg-soft-hover',
        ghost: 'bg-transparent text-foreground hover:bg-soft-hover',
        ok: 'bg-ok-bg text-ok hover:bg-ok-bg-hover',
        danger: 'bg-danger-bg text-danger hover:bg-danger-bg-hover',
      },
      shape: { labeled: 'gap-2 px-2 text-[13.5px]', icon: 'p-0' },
      size: { desktop: '', mobile: '', sticky: '' },
    },
    compoundVariants: [
      { shape: 'labeled', size: 'desktop', className: 'h-9 w-[140px]' },
      { shape: 'labeled', size: 'mobile', className: 'h-11 w-full' },
      { shape: 'labeled', size: 'sticky', className: 'h-12 w-full' },
      { shape: 'icon', size: 'desktop', className: 'size-9' },
      { shape: 'icon', size: ['mobile', 'sticky'], className: 'size-11' },
    ],
  },
)

interface BaseProps extends Omit<ComponentProps<'button'>, 'children'> {
  icon: LucideIcon
  variant?: ButtonVariant
  /** Defaults to "desktop" or "mobile" from the viewport width. */
  size?: ButtonSize
  loading?: boolean
  /** Render as a router link that looks like this button. */
  to?: string
}

export interface LabeledButtonProps extends BaseProps {
  shape?: 'labeled'
  label: ReactNode
}

export interface IconButtonProps extends BaseProps {
  shape: 'icon'
  /** Used for both aria-label and the tooltip. */
  label: string
}

export function Button(props: LabeledButtonProps | IconButtonProps) {
  const isMobile = useIsMobile()
  const {
    icon: Icon, label, variant = 'secondary', shape = 'labeled', size, loading = false,
    to, className, disabled, type = 'button', ...rest
  } = props
  const resolvedSize = size ?? (isMobile ? 'mobile' : 'desktop')
  const iconClass = resolvedSize === 'desktop' ? 'size-4' : 'size-[18px]'

  const content = (
    <>
      {loading ? <Loader2 className={cn(iconClass, 'animate-spin')} aria-hidden /> : <Icon className={iconClass} aria-hidden />}
      {shape === 'labeled' && <span className="min-w-0 truncate">{label}</span>}
    </>
  )

  const classes = cn(buttonStyles({ variant, shape, size: resolvedSize }), className)
  const a11y = shape === 'icon' ? { 'aria-label': label as string } : {}

  const button = to ? (
    <ShadcnButton asChild className={classes}>
      <Link to={to} {...a11y}>{content}</Link>
    </ShadcnButton>
  ) : (
    <ShadcnButton
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...a11y}
      {...rest}
    >
      {content}
    </ShadcnButton>
  )

  if (shape !== 'icon') return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Shorthand for <Button shape="icon" />. */
export function IconButton(props: Omit<IconButtonProps, 'shape'>) {
  return <Button {...props} shape="icon" />
}
