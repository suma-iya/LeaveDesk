-- Members of the Human Resources department are HR (see
-- domain.IsHRDepartment). Promote anyone already there.
UPDATE users SET role = 'hr'
WHERE role = 'employee'
  AND department_id IN (SELECT id FROM departments WHERE lower(trim(name)) IN ('human resources', 'hr'));
