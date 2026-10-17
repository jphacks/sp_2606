begin;
create index if not exists study_records_activity_order on public.study_records(created_at desc,id desc);
create function public.read_activity_feed(p_mode text default 'similar',p_owner uuid default null,p_field text default null)
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
 order by a.created_at desc,a.id desc,a.kind limit 20;
end $$;
revoke execute on function public.read_activity_feed(text,uuid,text) from public,anon;
grant execute on function public.read_activity_feed(text,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
