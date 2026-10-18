begin;
create table private.mfa_security (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revoked_before bigint not null,
 requires_reenroll boolean not null default true,
 allowed_session uuid
);
create table private.mfa_email_recovery (
 user_id uuid primary key references auth.users(id) on delete cascade,
 request_id uuid not null, code_hash text not null check(length(code_hash)=64),
 expires_at timestamptz not null, sent_at timestamptz not null default now(),
 attempts integer not null default 0, consumed boolean not null default false
);
alter table private.mfa_security enable row level security;
alter table private.mfa_email_recovery enable row level security;
revoke all on private.mfa_security,private.mfa_email_recovery from public,anon,authenticated;
create function private.mfa_token_fresh() returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.mfa_security s where s.user_id=auth.uid()
 and not (coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'iat')::bigint,0)>s.revoked_before
 or (s.allowed_session is not null and s.allowed_session::text=nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')))
$$;
create or replace function private.mfa_satisfied() returns boolean
language sql stable security definer set search_path='' as $$
 select private.mfa_token_fresh()
 and not exists(select 1 from private.mfa_security where user_id=auth.uid() and requires_reenroll)
 and (coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2'
 or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'))
$$;
create or replace function public.mfa_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s private.mfa_security%rowtype; sid text:=nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id'; begin
 if not private.active(auth.uid()) then raise exception 'not_allowed' using errcode='42501'; end if;
 select * into s from private.mfa_security where user_id=auth.uid();
 return jsonb_build_object('ready',true,'required',not private.mfa_satisfied(),
 'revoked',not private.mfa_token_fresh(),'reenroll',coalesce(s.requires_reenroll,false),
 'can_enroll',coalesce(s.requires_reenroll and s.allowed_session::text=sid,false));
end $$;
-- Admin-only helpers: user ID comes from the verified server session, never request JSON.
create function public.begin_mfa_email_recovery(p_user uuid,p_request uuid,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare prior private.mfa_email_recovery%rowtype; begin
 if not private.active(p_user) then raise exception 'not_allowed'; end if;
 -- Serialize concurrent sends, including the first one.
 perform 1 from private.accounts where id=p_user for update;
 select * into prior from private.mfa_email_recovery where user_id=p_user;
 if found and prior.sent_at>now()-interval '60 seconds' then raise exception 'rate_limited'; end if;
 insert into private.mfa_email_recovery(user_id,request_id,code_hash,expires_at)
 values(p_user,p_request,p_hash,now()+interval '10 minutes')
 on conflict(user_id) do update set request_id=excluded.request_id,code_hash=excluded.code_hash,
 expires_at=excluded.expires_at,sent_at=now(),attempts=0,consumed=false;
end $$;
create function public.verify_mfa_email_recovery(p_user uuid,p_request uuid,p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.mfa_email_recovery%rowtype; begin
 if not private.active(p_user) then return false; end if;
 select * into r from private.mfa_email_recovery where user_id=p_user for update;
 if not found or r.request_id<>p_request or r.consumed or r.expires_at<=now() or r.attempts>=5 then return false; end if;
 -- Returning false commits the attempt counter; raising would roll it back.
 update private.mfa_email_recovery set attempts=attempts+1 where user_id=p_user;
 if r.code_hash<>p_hash then return false; end if;
 update private.mfa_email_recovery set consumed=true where user_id=p_user;
 insert into private.mfa_security(user_id,revoked_before,requires_reenroll,allowed_session)
 values(p_user,floor(extract(epoch from now()))::bigint,true,null)
 on conflict(user_id) do update set revoked_before=excluded.revoked_before,requires_reenroll=true,allowed_session=null;
 return true;
end $$;
create function public.authorize_mfa_reenrollment(p_user uuid,p_session uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.mfa_security set allowed_session=p_session where user_id=p_user and requires_reenroll;
 if not found then raise exception 'not_allowed'; end if;
end $$;
create function public.complete_mfa_reenrollment() returns void
language plpgsql security definer set search_path='' as $$
declare claims jsonb:=nullif(current_setting('request.jwt.claims',true),'')::jsonb; begin
 if not private.active(auth.uid()) or claims->>'aal' is distinct from 'aal2' then raise exception 'not_allowed'; end if;
 if not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified' and factor_type='totp') then raise exception 'not_allowed'; end if;
 update private.mfa_security set requires_reenroll=false
 where user_id=auth.uid() and requires_reenroll and allowed_session::text=claims->>'session_id';
 if not found then raise exception 'not_allowed'; end if;
end $$;
create or replace function public.consume_mfa_attempt(p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); n integer; t timestamptz; lim integer; daily integer; begin
 if not private.active(u) then raise exception 'not_allowed' using errcode='42501'; end if;
 if p_action not in ('enroll','verify','unenroll','recovery_send','recovery_verify') then raise exception 'not_allowed' using errcode='42501'; end if;
 lim:=case when p_action='verify' then 10 when p_action='recovery_send' then 1 else 5 end;
 daily:=case when p_action='recovery_send' then 5 else 200 end;
 t:=date_trunc('minute',now());
 insert into private.rate_counters values(u,'mfa_'||p_action||':minute',t,1)
 on conflict(user_id,action,period) do update set hits=private.rate_counters.hits+1 returning hits into n;
 if n>lim then raise exception 'rate_limited'; end if;
 t:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 insert into private.rate_counters values(u,'mfa_'||p_action||':day',t,1)
 on conflict(user_id,action,period) do update set hits=private.rate_counters.hits+1 returning hits into n;
 if n>daily then raise exception 'rate_limited'; end if;
end $$;
revoke all on function private.mfa_token_fresh() from public,anon,authenticated;
revoke all on function public.begin_mfa_email_recovery(uuid,uuid,text),public.verify_mfa_email_recovery(uuid,uuid,text),public.authorize_mfa_reenrollment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_mfa_email_recovery(uuid,uuid,text),public.verify_mfa_email_recovery(uuid,uuid,text),public.authorize_mfa_reenrollment(uuid,uuid) to service_role;
revoke all on function public.complete_mfa_reenrollment() from public,anon;
grant execute on function public.complete_mfa_reenrollment() to authenticated;
commit;
