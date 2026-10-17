begin;
-- The legacy visibility key 'mutual' now means approved followers only.
-- DM policy 'mutual' and private.mutual() keep their reciprocal-follow meaning.
create or replace function private.visible_post(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select private.visible_person(target) and (
  target=auth.uid() or exists(
   select 1 from private.preferences p where p.id=target and (
    p.visibility='public' or (p.visibility='mutual' and exists(
     select 1 from private.follows f
     where f.follower=auth.uid() and f.following=target and f.approved
    ))
   )
  )
 )
$$;
notify pgrst,'reload schema';
commit;
