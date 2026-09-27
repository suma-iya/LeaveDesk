import { useEffect } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { HeaderActions } from '@/layouts/HeaderActions'
import { TeamCalendarView } from './TeamCalendarView'

/** /calendar (both roles): a normal page in the app shell, opened from the header's calendar icon. */
export function TeamCalendarPage() {
  useEffect(() => {
    const previous = document.title
    document.title = 'Team calendar · LeaveDesk'
    return () => { document.title = previous }
  }, [])

  return (
    <>
      <PageHeader title="Team calendar" subtitle="Click a day to see who is away. Fri and Sat are weekend."
        actions={<HeaderActions />} />
      <TeamCalendarView />
    </>
  )
}
