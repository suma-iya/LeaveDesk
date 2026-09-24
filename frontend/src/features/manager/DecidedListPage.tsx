import { useMemo } from 'react'
import { Download, RotateCcw } from 'lucide-react'
import { Button } from '@/components/Button'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { DecidedCard } from './cards'
import { hrColumns, type HrList } from './columns'
import { exportRequests } from './exportCsv'
import { useRequestRows } from './hooks'
import { useHrFilters } from './useHrFilters'

interface Props {
  list: Exclude<HrList, 'pending'>
  title: string
  subtitle: string
}

/** Approved and All requests share this table: Status + Decided by, view-only actions. */
export function DecidedListPage({ list, title, subtitle }: Props) {
  const { filters, params, reset, isFiltered } = useHrFilters({ withStatus: list === 'all', withYear: true })
  const rows = useRequestRows(list === 'approved' ? { ...params, status: 'approved' } : params)

  const columns = useMemo(() => {
    const c = hrColumns(list)
    return [c.employee, c.type, c.dates, c.days, c.balance, c.submitted, c.status, c.decidedBy, c.view]
  }, [list])

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={<Button icon={Download} label="Export CSV" disabled={!rows.data?.length}
          onClick={() => exportRequests(`${list}-requests.csv`, rows.data ?? [])} />}
      />
      <DataTable
        filters={filters}
        onReset={reset}
        columns={columns}
        data={rows.data}
        isLoading={rows.isPending}
        error={rows.error}
        onRetry={() => rows.refetch()}
        getRowId={(row) => row.request.id}
        emptyMessage={isFiltered ? 'No requests match these filters' : list === 'approved' ? 'No approved requests yet' : 'No requests yet'}
        emptyAction={isFiltered ? <Button icon={RotateCcw} label="Reset filters" onClick={reset} /> : undefined}
        renderCard={(row) => <DecidedCard row={row} from={list} />}
      />
    </>
  )
}
