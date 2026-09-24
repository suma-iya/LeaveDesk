import { DEFAULT_WEEKEND, workingDays } from '@/lib/leave'
import type { Employee, LeaveRequest, LeaveType, Policy, Status } from '@/types'

// Seed data for VITE_USE_MOCK=true. Everyone's password is "password123".

export const MOCK_PASSWORD = 'password123'
export const HR_ID = 'e-farhana'
export const EMPLOYEE_ID = 'e-nusrat'

export const seedPolicy: Policy = {
  allowances: { Annual: 16, Casual: 3, Sick: 3 },
  weekendDays: DEFAULT_WEEKEND,
}

type Seed = [id: string, first: string, last: string, department: string, jobTitle: string, age: number, years: number]

const people: Seed[] = [
  [HR_ID, 'Farhana', 'Islam', 'HR', 'HR Manager', 38, 9],
  [EMPLOYEE_ID, 'Nusrat', 'Jahan', 'Engineering', 'Software Engineer', 27, 4],
  ['e-tanvir', 'Tanvir', 'Ahmed', 'Engineering', 'Backend Engineer', 31, 6],
  ['e-tasnim', 'Tasnim', 'Akter', 'Engineering', 'Frontend Engineer', 26, 2],
  ['e-imran', 'Imran', 'Hossain', 'Finance', 'Accountant', 34, 7],
  ['e-kamrul', 'Kamrul', 'Islam', 'Finance', 'Financial Analyst', 29, 3],
  ['e-sadia', 'Sadia', 'Rahman', 'Design', 'Product Designer', 28, 3],
  ['e-nadia', 'Nadia', 'Sultana', 'Design', 'UX Researcher', 30, 5],
  ['e-rakib', 'Rakib', 'Hasan', 'QA', 'QA Engineer', 27, 2],
  ['e-shafiq', 'Shafiq', 'Uddin', 'QA', 'Test Automation Engineer', 33, 6],
  ['e-mehnaz', 'Mehnaz', 'Karim', 'Operations', 'Operations Lead', 36, 8],
  ['e-jahid', 'Jahid', 'Hasan', 'Operations', 'Logistics Coordinator', 25, 1],
  ['e-arif', 'Arif', 'Chowdhury', 'Support', 'Support Specialist', 24, 1],
  ['e-rumana', 'Rumana', 'Begum', 'Support', 'Support Lead', 35, 7],
]

export const seedEmployees: Employee[] = people.map(([id, firstName, lastName, department, jobTitle, age, yearsAtCompany]) => ({
  id, firstName, lastName, department, jobTitle, age, yearsAtCompany,
  email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@leavedesk.test`,
  role: id === HR_ID ? 'hr' : 'employee',
}))

interface Extra {
  note?: string
  decidedAt?: string
  attachment?: LeaveRequest['attachment']
}

function leave(
  id: number, employeeId: string, type: LeaveType, startDate: string, endDate: string,
  status: Status, submittedAt: string, reason: string, extra: Extra = {},
): LeaveRequest {
  const decided = status !== 'pending'
  return {
    id: `LV-${id}`, employeeId, type, startDate, endDate, status, submittedAt, reason,
    workingDays: workingDays(startDate, endDate, seedPolicy.weekendDays),
    attachment: extra.attachment,
    decidedAt: decided ? extra.decidedAt ?? submittedAt : undefined,
    decidedBy: decided ? HR_ID : undefined,
    decisionNote: decided ? extra.note ?? '' : undefined,
  }
}

const A: LeaveType = 'Annual'
const C: LeaveType = 'Casual'
const S: LeaveType = 'Sick'

export const seedRequests: LeaveRequest[] = [
  // Nusrat (employee demo user): 5 annual, 2 casual, 1 sick used; 6 pending.
  leave(1702, EMPLOYEE_ID, S, '2026-01-07', '2026-01-07', 'approved', '2026-01-07', 'Migraine, stayed home.', { decidedAt: '2026-01-08', note: 'Get well soon.' }),
  leave(1744, EMPLOYEE_ID, C, '2026-02-10', '2026-02-11', 'approved', '2026-02-01', 'Moving to a new flat.', { decidedAt: '2026-02-02' }),
  leave(1790, EMPLOYEE_ID, A, '2026-03-15', '2026-03-19', 'approved', '2026-02-25', 'Eid holidays with family in Rajshahi.', { decidedAt: '2026-02-27', note: 'Approved. Please hand over the release checklist to Tanvir.' }),
  leave(1851, EMPLOYEE_ID, A, '2026-05-03', '2026-05-07', 'rejected', '2026-04-18', 'Attending my cousin’s wedding in Chattogram. Travel plan attached.', {
    decidedAt: '2026-04-21',
    note: 'The v3 launch is that week and the team needs you. Please pick dates after 20 May and resubmit.',
    attachment: { url: '/mock/travel-plan.pdf', name: 'travel-plan.pdf', sizeBytes: 1741, mime: 'application/pdf', pages: 2 },
  }),
  leave(2041, EMPLOYEE_ID, A, '2026-10-04', '2026-10-08', 'pending', '2026-09-20', 'Family trip to Sylhet for my parents’ anniversary.'),
  leave(2047, EMPLOYEE_ID, S, '2026-10-21', '2026-10-21', 'pending', '2026-09-24', 'Minor dental surgery; the dentist advised one day of rest.'),

  // Pending for HR, clustered on the busy week of 4–8 Oct.
  leave(2043, 'e-tanvir', A, '2026-10-04', '2026-10-07', 'pending', '2026-09-21', 'Visiting my grandparents in Barishal.'),
  leave(2044, 'e-imran', C, '2026-10-05', '2026-10-06', 'pending', '2026-09-22', 'Bank and land registry appointments.'),
  leave(2045, 'e-sadia', A, '2026-10-06', '2026-10-08', 'pending', '2026-09-22', 'Short break after the design sprint.'),
  leave(2046, 'e-rakib', S, '2026-09-28', '2026-09-29', 'pending', '2026-09-24', 'Fever and sore throat.'),
  leave(2048, 'e-mehnaz', A, '2026-10-12', '2026-10-15', 'pending', '2026-09-23', 'Trip to Cox’s Bazar.'),
  leave(2049, 'e-arif', C, '2026-10-19', '2026-10-19', 'pending', '2026-09-25', 'Renewing my passport.'),
  leave(2050, 'e-tasnim', A, '2026-11-01', '2026-11-05', 'pending', '2026-09-25', 'Conference and a few days off in Kathmandu.'),
  leave(2051, 'e-kamrul', A, '2026-10-25', '2026-10-29', 'pending', '2026-09-23', 'Brother’s wedding.'),

  // Already decided around the same week.
  leave(2030, 'e-nadia', A, '2026-10-04', '2026-10-08', 'approved', '2026-09-10', 'Pre-planned holiday.', { decidedAt: '2026-09-11' }),
  leave(2031, 'e-shafiq', C, '2026-10-07', '2026-10-07', 'approved', '2026-09-12', 'Child’s school event.', { decidedAt: '2026-09-13' }),
  leave(2032, 'e-rumana', A, '2026-10-05', '2026-10-08', 'approved', '2026-09-08', 'Hajj preparations with family.', { decidedAt: '2026-09-09', note: 'Arif covers the queue.' }),
  leave(2033, 'e-jahid', S, '2026-10-01', '2026-10-01', 'approved', '2026-09-18', 'Doctor’s appointment.', { decidedAt: '2026-09-18' }),
  leave(2034, 'e-tasnim', C, '2026-10-07', '2026-10-08', 'approved', '2026-09-15', 'Moving house.', { decidedAt: '2026-09-16' }),
  leave(2035, 'e-kamrul', A, '2026-10-06', '2026-10-08', 'rejected', '2026-09-14', 'Short holiday.', { decidedAt: '2026-09-15', note: 'Quarter-end close that week. Please pick another week.' }),

  // Earlier in 2026, so yearly balances vary (a few are nearly used up).
  leave(1710, 'e-tanvir', A, '2026-01-18', '2026-01-22', 'approved', '2026-01-05', 'Winter trip.'),
  leave(1760, 'e-tanvir', A, '2026-04-05', '2026-04-09', 'approved', '2026-03-20', 'Family visit.'),
  leave(1801, 'e-tanvir', A, '2026-06-14', '2026-06-18', 'approved', '2026-06-01', 'Summer holiday.'),
  leave(1805, 'e-tanvir', C, '2026-07-01', '2026-07-02', 'approved', '2026-06-28', 'Personal errands.'),
  leave(1712, 'e-imran', A, '2026-02-22', '2026-02-26', 'approved', '2026-02-08', 'Family event.'),
  leave(1812, 'e-imran', S, '2026-07-12', '2026-07-13', 'approved', '2026-07-12', 'Stomach flu.'),
  leave(1720, 'e-sadia', A, '2026-08-09', '2026-08-11', 'approved', '2026-07-28', 'Design conference.'),
  leave(1730, 'e-rakib', A, '2026-04-05', '2026-04-09', 'approved', '2026-03-22', 'Trip home.'),
  leave(1731, 'e-rakib', C, '2026-06-02', '2026-06-03', 'approved', '2026-05-30', 'House repairs.'),
  leave(1740, 'e-mehnaz', A, '2026-01-18', '2026-01-22', 'approved', '2026-01-04', 'Winter holiday.'),
  leave(1741, 'e-mehnaz', A, '2026-07-12', '2026-07-16', 'approved', '2026-06-30', 'Family trip.'),
  leave(1742, 'e-mehnaz', S, '2026-08-24', '2026-08-26', 'approved', '2026-08-24', 'Dengue fever.'),
  leave(1750, 'e-kamrul', A, '2026-02-22', '2026-02-26', 'approved', '2026-02-10', 'Travel.'),
  leave(1751, 'e-kamrul', A, '2026-06-14', '2026-06-18', 'approved', '2026-06-01', 'Travel.'),
  leave(1752, 'e-kamrul', A, '2026-08-23', '2026-08-27', 'approved', '2026-08-10', 'Travel.'),
  leave(1753, 'e-kamrul', C, '2026-09-06', '2026-09-07', 'approved', '2026-09-01', 'Personal.'),
  leave(1763, 'e-nadia', A, '2026-03-15', '2026-03-16', 'approved', '2026-03-01', 'Long weekend.'),
  leave(1770, 'e-shafiq', A, '2026-08-09', '2026-08-13', 'approved', '2026-07-25', 'Holiday.'),
  leave(1780, 'e-rumana', A, '2026-02-22', '2026-02-26', 'approved', '2026-02-10', 'Umrah.'),
  leave(1781, 'e-rumana', S, '2026-05-12', '2026-05-13', 'approved', '2026-05-12', 'Back pain.'),
  leave(1785, 'e-jahid', C, '2026-06-24', '2026-06-24', 'approved', '2026-06-20', 'University exam.'),
  leave(1786, 'e-arif', C, '2026-08-19', '2026-08-19', 'rejected', '2026-08-15', 'Personal work.', { decidedAt: '2026-08-16', note: 'Two teammates are already off that day.' }),
  leave(1787, 'e-tasnim', A, '2026-07-12', '2026-07-16', 'approved', '2026-06-29', 'Visiting family in Khulna.'),
]
