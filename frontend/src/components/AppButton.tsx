import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cva } from 'class-variance-authority'
import { Loader2, type LucideIcon } from 'lucide-react'
import { Button as ShadcnButton } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'

// The ONLY button in the app: <AppButton variant shape size>.
//  - labeled: icon + text. Desktop is always exactly 140×36; on mobile and in
//    auth forms ("block") it fills the width at 44px; sticky bottom bars 48px.
//  - icon: square, 36 desktop / 44 mobile, always with aria-label + tooltip.
// Icon buttons inside a card or toolbar are ghost; page-level ones secondary.
// Sizes live here so no page can drift from the spec.

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'ok' | 'danger'
export type ButtonSize = 'desktop' | 'mobile' | 'block' | 'sticky'

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
      shape: { labeled: 'gap-2 px-1 text-[13.5px] tracking-[-0.01em]', icon: 'p-0' },
      size: { desktop: '', mobile: '', block: '', sticky: '' },
    },
    compoundVariants: [
      { shape: 'labeled', size: 'desktop', className: 'h-9 w-[140px]' },
      { shape: 'labeled', size: ['mobile', 'block'], className: 'h-11 w-full' },
      { shape: 'labeled', size: 'sticky', className: 'h-12 w-full' },
      { shape: 'icon', size: 'desktop', className: 'size-9' },
      { shape: 'icon', size: ['mobile', 'block', 'sticky'], className: 'size-11' },
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
  /** Render as a plain link (downloads, new tabs). */
  href?: string
  download?: string
  target?: string
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

export function AppButton(props: LabeledButtonProps | IconButtonProps) {
  const isMobile = useIsMobile()
  const {
    icon: Icon, label, variant = 'secondary', shape = 'labeled', size, loading = false,
    to, href, download, target, className, disabled, type = 'button', ...rest
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
  ) : href ? (
    <ShadcnButton asChild className={classes}>
      <a href={href} download={download} target={target} rel={target ? 'noreferrer' : undefined} {...a11y}>{content}</a>
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

/** Shorthand for <AppButton shape="icon" />. */
export function IconButton(props: Omit<IconButtonProps, 'shape'>) {
  return <AppButton {...props} shape="icon" />
}
