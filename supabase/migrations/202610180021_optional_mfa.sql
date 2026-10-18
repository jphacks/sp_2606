-- Opt-in MFA is enforced against current Auth factors, including old aal1 JWTs.
create function private.mfa_satisfied() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','aal1')='aal2'
 or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
$$;
revoke all on function private.mfa_satisfied() from public,anon,authenticated;
create or replace function private.require_active() returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); begin
 if not private.active(u) then raise exception 'not_allowed' using errcode='42501'; end if;
 if not private.mfa_satisfied() then raise exception 'mfa_required' using errcode='42501'; end if;
 return u;
end $$;
create or replace function private.visible_person(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.active(auth.uid()) and private.mfa_satisfied() and private.active(target) and not private.blocked(auth.uid(),target)
$$;
-- This narrow endpoint is available before MFA; it returns no application data.
create function public.mfa_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.active(auth.uid()) then raise exception 'not_allowed' using errcode='42501'; end if;
 return jsonb_build_object('ready',true,'required',not private.mfa_satisfied());
end $$;
create function public.consume_mfa_attempt(p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); n integer; t timestamptz; lim integer; begin
 if not private.active(u) then raise exception 'not_allowed' using errcode='42501'; end if;
 if p_action not in ('enroll','verify','unenroll') then raise exception 'not_allowed' using errcode='42501'; end if;
 lim:=case when p_action='verify' then 10 else 5 end;
 t:=date_trunc('minute',now());
 insert into private.rate_counters values(u,'mfa_'||p_action||':minute',t,1)
 on conflict(user_id,action,period) do update set hits=private.rate_counters.hits+1 returning hits into n;
 if n>lim then raise exception 'rate_limited'; end if;
 t:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 insert into private.rate_counters values(u,'mfa_'||p_action||':day',t,1)
 on conflict(user_id,action,period) do update set hits=private.rate_counters.hits+1 returning hits into n;
 if n>200 then raise exception 'rate_limited'; end if;
end $$;
revoke all on function public.mfa_status(),public.consume_mfa_attempt(text) from public,anon;
grant execute on function public.mfa_status(),public.consume_mfa_attempt(text) to authenticated;
