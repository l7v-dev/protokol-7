-- psycopg named parameters; do not execute as a standalone psql migration.
-- Claim the broker-notified job in a short transaction.
UPDATE job SET status='running', lease_owner=%(owner)s,
 lease_epoch=lease_epoch+1, lease_until=now()+interval '120 seconds',
 attempt=attempt+1, updated_at=now()
WHERE id=%(job_id)s AND status IN ('pending','retry_wait')
 AND available_at<=now() AND attempt<max_attempts
RETURNING *;

-- Heartbeat; zero affected rows means lost lease.
UPDATE job SET lease_until=now()+interval '120 seconds'
WHERE id=%(job_id)s AND status='running' AND lease_owner=%(owner)s
 AND lease_epoch=%(epoch)s AND lease_until>now();

-- Finalize in same transaction as artifact+child job+outbox inserts.
-- If rowcount != 1, rollback the entire transaction.
UPDATE job SET status='succeeded', lease_until=NULL, lease_owner=NULL, updated_at=now()
WHERE id=%(job_id)s AND status='running' AND lease_owner=%(owner)s
 AND lease_epoch=%(epoch)s AND lease_until>now();

-- Lease reaper. New claim increments epoch; exhausted jobs are terminal.
UPDATE job SET status=CASE WHEN attempt>=max_attempts THEN 'failed' ELSE 'retry_wait' END,
 lease_owner=NULL,lease_until=NULL,available_at=now(),updated_at=now(),error_code='lease_expired'
WHERE status='running' AND lease_until<now();

-- Outbox claim in transaction; publish after commit, mark only on confirm
-- AND matching dispatch owner/epoch. Unknown confirm is replayed.
WITH picked AS (
 SELECT id FROM outbox_event WHERE published_at IS NULL
 AND (dispatch_until IS NULL OR dispatch_until<now())
 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 100
)
UPDATE outbox_event e SET dispatch_owner=%(owner)s,
 dispatch_until=now()+interval '60 seconds',dispatch_epoch=dispatch_epoch+1
FROM picked WHERE e.id=picked.id RETURNING e.*;
