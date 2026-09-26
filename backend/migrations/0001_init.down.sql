DROP TABLE IF EXISTS audit_log, salaries, leave_requests, leave_limits;
ALTER TABLE IF EXISTS users DROP CONSTRAINT IF EXISTS users_avatar_fk;
DROP TABLE IF EXISTS files, users, departments;
