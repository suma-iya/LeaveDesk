import { authApi } from './auth'
import { calendarApi } from './calendar'
import { filesApi } from './files'
import { hrApi } from './hr'
import { meApi } from './me'
import { requestsApi } from './requests'

export { ApiError } from './http'

/** Every backend call the UI makes, grouped by resource. */
export const api = {
  auth: authApi,
  me: meApi,
  requests: requestsApi,
  hr: hrApi,
  calendar: calendarApi,
  files: filesApi,
}
