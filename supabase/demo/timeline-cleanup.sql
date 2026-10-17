-- Run only when explicitly removing this disposable demo batch.
-- No unregistered real user can match this deletion.
begin;
delete from auth.users u using private.demo_seed_users d
where u.id=d.user_id and d.batch='timeline-demo-20261017-v1'
and u.raw_user_meta_data->>'costep_demo_batch'=d.batch
and u.email like 'costep-demo-%@example.invalid';
commit;
