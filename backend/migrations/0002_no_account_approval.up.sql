-- Accounts no longer wait for HR approval: everyone is active from sign-up.
-- Anyone still pending is activated (joining on the day they registered),
-- then the status column goes away.
UPDATE users SET joined_on = created_at::date WHERE status = 'pending' AND joined_on IS NULL;
ALTER TABLE users DROP COLUMN status;
