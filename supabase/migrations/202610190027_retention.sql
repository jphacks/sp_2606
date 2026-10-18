begin;
-- Deliberately no auth.users FK: these two fields survive deletion for eight days.
create table private.account_deletions (
 user_id uuid primary key,
 deleted_at timestamptz not null default clock_timestamp()
);
alter table private.account_deletions enable row level security;
revoke all on private.account_deletions from public,anon,authenticated;
create function private.record_account_deletion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.account_deletions(user_id,deleted_at) values(old.id,clock_timestamp())
 on conflict(user_id) do update set deleted_at=excluded.deleted_at;
 return old;
end $$;
revoke all on function private.record_account_deletion() from public,anon,authenticated;
create trigger costep_record_deletion after delete on auth.users for each row execute function private.record_account_deletion();
create function public.cleanup_retained_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare d integer; m integer; begin
 delete from private.account_deletions where deleted_at<=clock_timestamp()-interval '8 days';get diagnostics d=row_count;
 delete from private.security_event_counters where bucket<clock_timestamp()-interval '7 days';get diagnostics m=row_count;
 return jsonb_build_object('deletion_records_removed',d,'metric_rows_removed',m);
end $$;
create function public.export_account_deletions() returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('exported_at',clock_timestamp(),'records',coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'deleted_at',deleted_at)),'[]'::jsonb))
 from private.account_deletions where deleted_at>clock_timestamp()-interval '8 days'
$$;
revoke all on function public.cleanup_retained_data(),public.export_account_deletions() from public,anon,authenticated;
grant execute on function public.cleanup_retained_data(),public.export_account_deletions() to service_role;
notify pgrst,'reload schema';
commit;
