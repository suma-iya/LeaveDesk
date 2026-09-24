-- The service already checks for overlaps, but two requests arriving at the
-- same moment could both pass that check. This constraint makes Postgres
-- itself reject a second PENDING/APPROVED leave whose date range overlaps
-- (&&) another one for the same user. btree_gist lets a GiST index combine
-- "user_id equal" with "date ranges overlap".

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leaves_no_overlap') THEN
        ALTER TABLE leaves ADD CONSTRAINT leaves_no_overlap EXCLUDE USING gist (
            user_id WITH =,
            daterange(start_date, end_date, '[]') WITH &&
        ) WHERE (status IN ('PENDING', 'APPROVED'));
    END IF;
END
$$;
