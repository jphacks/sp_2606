begin;
-- Aggregate counters only: no identity, IP, token, request body or free text.
create table private.security_event_counters (
 bucket timestamptz not null,
 scope text not null check(scope in ('login','password_email','mfa','mfa_recovery')),
 outcome text not null check(outcome in ('ok','rejected','error')),
 total integer not null check(total between 1 and 1000000),
 primary key(bucket,scope,outcome)
);
alter table private.security_event_counters enable row level security;
revoke all on private.security_event_counters from public,anon,authenticated;
create function public.record_security_metric(p_scope text,p_outcome text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_scope is null or p_scope not in ('login','password_email','mfa','mfa_recovery')
 or p_outcome is null or p_outcome not in ('ok','rejected','error') then raise exception 'invalid_metric'; end if;
 insert into private.security_event_counters values(date_trunc('minute',now()),p_scope,p_outcome,1)
 on conflict(bucket,scope,outcome) do update set total=least(private.security_event_counters.total+1,1000000);
 delete from private.security_event_counters where bucket<now()-interval '7 days';
end $$;
create function public.read_security_metrics() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',1,'window_minutes',30,
 'counts',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select scope,outcome,sum(total)::bigint total from private.security_event_counters
 where bucket>=date_trunc('minute',now())-interval '30 minutes' group by scope,outcome order by scope,outcome
 ) x),'[]'::jsonb))
$$;
revoke all on function public.record_security_metric(text,text),public.read_security_metrics() from public,anon,authenticated;
grant execute on function public.record_security_metric(text,text),public.read_security_metrics() to service_role;
notify pgrst,'reload schema';
commit;
