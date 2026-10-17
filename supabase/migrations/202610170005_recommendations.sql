-- Rank all eligible profiles in the database; never truncate to newest 100 first.
begin;
create function private.recommendation_score(viewer public.profiles,candidate public.profiles)
returns double precision language sql immutable set search_path='' as $$
 select coalesce((select max(100 + case
 when a->>'mode'='level' and b->>'mode'='level' then greatest(0,3-abs((a->>'level')::integer-(b->>'level')::integer))*10
 when a->>'mode'='time' and b->>'mode'='time' then 30.0/(1+abs(ln(((a->>'total_minutes')::double precision+60)/((b->>'total_minutes')::double precision+60))))
 else 0 end)
 from jsonb_array_elements(viewer.learning_fields) a,jsonb_array_elements(candidate.learning_fields) b
 where a->>'field'=b->>'field'),0)
 + case when viewer.goal<>'' and viewer.goal=candidate.goal then 20 else 0 end
$$;
revoke execute on function private.recommendation_score(public.profiles,public.profiles) from public,anon,authenticated;
create function public.read_recommendations() returns setof public.profiles
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); begin
 perform private.consume('read_recommendations',30,3000);
 return query select candidate.* from public.profiles candidate
 join public.profiles viewer on viewer.id=u
 where candidate.id<>u and candidate.recommend and private.visible_person(candidate.id)
 order by private.recommendation_score(viewer,candidate) desc,candidate.created_at desc,candidate.id asc
 limit 12;
end $$;
revoke execute on function public.read_recommendations() from public,anon;
grant execute on function public.read_recommendations() to authenticated;
commit;
