-- New recovery completions can resume without a replacement authenticator.
-- Existing recovery locks are not cleared by migration.
create function public.complete_mfa_email_recovery(p_user uuid,p_request uuid,p_session uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.active(p_user) then raise exception 'not_allowed'; end if;
 perform 1 from private.mfa_security where user_id=p_user and requires_reenroll for update;
 if not found then raise exception 'not_allowed'; end if;
 if not exists(select 1 from private.mfa_email_recovery
  where user_id=p_user and request_id=p_request and consumed and expires_at>now())
 then raise exception 'not_allowed'; end if;
 if exists(select 1 from auth.mfa_factors where user_id=p_user and status='verified')
 then raise exception 'factors_still_active'; end if;
 update private.mfa_security set requires_reenroll=false,allowed_session=p_session where user_id=p_user;
end $$;
revoke all on function public.complete_mfa_email_recovery(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_mfa_email_recovery(uuid,uuid,uuid) to service_role;
-- Deployment capability check; no user data or elevated operation is exposed.
create function public.mfa_email_recovery_mode() returns text
language sql stable set search_path='' as $$select 'optional_reenroll'::text$$;
revoke all on function public.mfa_email_recovery_mode() from public,anon;
grant execute on function public.mfa_email_recovery_mode() to authenticated,service_role;
