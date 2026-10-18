begin;
create function private.valid_field_modes(items jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(items) f join private.goal_catalog c on f->>'field'=case c.id when 'cert-ipa-fe' then '基本情報' when 'cert-ipa-ap' then '応用情報' when 'tech-aws' then 'AWS' else case when length(c.label)<=30 then c.label else c.id end end
 where c.active and ((c.kind='certification' and f->>'mode'<>'time') or (c.kind='technology' and f->>'mode'<>'level')))
$$;
revoke execute on function private.valid_field_modes(jsonb) from public,anon,authenticated;
create or replace function public.save_profile_fields(p_name text,p_fields jsonb,p_goal text,p_bio text,p_recommend boolean,p_visibility text,p_dm_policy text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); first_item jsonb; begin
 perform 1 from private.accounts where id=u for update;
 perform private.consume('settings',10,100);
 if not private.valid_field_modes(p_fields) or not private.valid_learning_fields(p_fields) then raise exception 'invalid_learning_fields'; end if;
 if p_visibility is null or p_visibility not in('public','mutual','private') or p_dm_policy is null or p_dm_policy not in('mutual','anyone') then raise exception 'invalid_settings'; end if;
 first_item:=p_fields->0;
 update public.profiles set display_name=btrim(p_name),learning_fields=p_fields,
 field=first_item->>'field',level=coalesce((first_item->>'level')::integer,0),
 goal=btrim(p_goal),bio=btrim(p_bio),recommend=p_recommend where id=u;
 update private.preferences set visibility=p_visibility,dm_policy=p_dm_policy,profile_completed=true where id=u;
end $$;
create or replace function public.read_activity_feed(p_mode text default 'similar',p_owner uuid default null,p_field text default null)
returns table(kind text,id uuid,owner_id uuid,body text,created_at timestamptz,field text,study_date date,minutes integer,memo text,author jsonb)
language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active();
begin
 if p_mode is null or p_mode not in ('recommended','similar','following') then raise exception 'invalid_mode'; end if;
 if p_field is not null and (length(p_field)<1 or length(p_field)>30) then raise exception 'invalid_field'; end if;
 perform private.consume('read_activity_feed',30,3000);
 return query
 with activities as (
  select 'post'::text kind,po.id,po.owner_id,po.body,po.created_at,null::text field,null::date study_date,null::integer minutes,null::text memo
  from public.posts po where private.visible_post(po.owner_id)
  union all
  select 'study'::text,r.id,r.owner_id,''::text,r.created_at,r.field,r.study_date,r.minutes,
   case when r.owner_id=u or (m.follow_post_visibility and private.visible_post(r.owner_id)) then m.body else null end
  from public.study_records r left join private.study_memos m on m.record_id=r.id
  where private.visible_person(r.owner_id)
 )
 select a.kind,a.id,a.owner_id,a.body,a.created_at,a.field,a.study_date,a.minutes,a.memo,to_jsonb(p)
 from activities a join public.profiles p on p.id=a.owner_id join public.profiles viewer on viewer.id=u
 where (p_owner is null or a.owner_id=p_owner)
 and (p_field is null or exists(select 1 from jsonb_array_elements(p.learning_fields) f where f->>'field'=p_field))
 and (p_owner is not null or p_mode<>'following' or exists(select 1 from private.follows f where f.follower=u and f.following=a.owner_id and f.approved))
 and (p_owner is not null or p_mode<>'similar' or private.fields_similar(p.learning_fields,viewer.learning_fields))
 order by case when p_mode='similar' and p_owner is null then private.goal_similarity(viewer.goals,p.goals) else 0 end desc,a.created_at desc,a.id desc,a.kind limit 20;
end $$;

create function public.read_comments_with_authors(p_post uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_active();
 return (select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('author',to_jsonb(p)) order by c.created_at,c.id),'[]'::jsonb)
 from public.read_comments(p_post) c join public.profiles p on p.id=c.owner_id);
end $$;
revoke execute on function public.read_comments_with_authors(uuid) from public,anon;
grant execute on function public.read_comments_with_authors(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
