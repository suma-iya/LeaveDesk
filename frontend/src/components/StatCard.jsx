import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function StatCard({ label, value, hint, icon: Icon, accent = 'text-muted-foreground' }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {Icon && <Icon className={`size-4 ${accent}`} />}
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{value ?? '—'}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
