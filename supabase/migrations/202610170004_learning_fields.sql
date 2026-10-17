begin;
create function private.valid_learning_fields(items jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb; names text[]:='{}'; name text; begin
 if items is null or jsonb_typeof(items)<>'array' then return false; end if;
 if jsonb_array_length(items)<1 or jsonb_array_length(items)>10 then return false; end if;
 for item in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(item)<>'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(item))<>4 or not (item ?& array['field','mode','level','total_minutes']) then return false; end if;
  if jsonb_typeof(item->'field')<>'string' or jsonb_typeof(item->'mode')<>'string' then return false; end if;
  name:=item->>'field';
  if name<>btrim(name) or char_length(name)<1 or char_length(name)>30 or lower(name)=any(names) then return false; end if;
  names:=array_append(names,lower(name));
  if item->>'mode'='level' then
   if jsonb_typeof(item->'level')<>'number' or (item->>'level') !~ '^[0-3]$' or item->'total_minutes'<>'null'::jsonb then return false; end if;
  elsif item->>'mode'='time' then
   if item->'level'<>'null'::jsonb or jsonb_typeof(item->'total_minutes')<>'number' then return false; end if;
   if (item->>'total_minutes') !~ '^[0-9]{1,7}$' then return false; end if;
   if (item->>'total_minutes')::bigint>6000000 then return false; end if;
  else return false; end if;
 end loop;
 return true;
end $$;
alter table public.profiles add column learning_fields jsonb not null default '[{"field":"Python","mode":"level","level":0,"total_minutes":null}]';
update public.profiles set learning_fields=jsonb_build_array(jsonb_build_object('field',field,'mode','level','level',level,'total_minutes',null));
alter table public.profiles add constraint profiles_learning_fields_valid check(private.valid_learning_fields(learning_fields));
create function public.save_profile_fields(p_name text,p_fields jsonb,p_goal text,p_bio text,p_recommend boolean,p_visibility text,p_dm_policy text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); first_item jsonb; begin
 perform 1 from private.accounts where id=u for update;
 perform private.consume('settings',10,100);
 if not private.valid_learning_fields(p_fields) then raise exception 'invalid_learning_fields'; end if;
 if p_visibility is null or p_visibility not in('public','mutual','private') or p_dm_policy is null or p_dm_policy not in('mutual','anyone') then raise exception 'invalid_settings'; end if;
 first_item:=p_fields->0;
 update public.profiles set display_name=btrim(p_name),learning_fields=p_fields,
 field=first_item->>'field',level=coalesce((first_item->>'level')::integer,0),
 goal=btrim(p_goal),bio=btrim(p_bio),recommend=p_recommend where id=u;
 update private.preferences set visibility=p_visibility,dm_policy=p_dm_policy,profile_completed=true where id=u;
end $$;
-- Keep old clients working without allowing them to erase newer multi-field/time settings.
create or replace function public.save_profile(p_name text,p_field text,p_level integer,p_goal text,p_bio text,p_recommend boolean,p_visibility text,p_dm_policy text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); items jsonb; old_field text; old_level integer; begin
 perform 1 from private.accounts where id=u for update;
 select learning_fields,field,level into items,old_field,old_level from public.profiles where id=u;
 if p_field is distinct from old_field or p_level is distinct from old_level then
  if jsonb_array_length(items)>1 or items->0->>'mode'<>'level' then raise exception 'refresh_profile_editor'; end if;
  items:=jsonb_build_array(jsonb_build_object('field',btrim(p_field),'mode','level','level',p_level,'total_minutes',null));
 end if;
 perform public.save_profile_fields(p_name,items,p_goal,p_bio,p_recommend,p_visibility,p_dm_policy);
end $$;
create function private.fields_similar(a jsonb,b jsonb) returns boolean language sql immutable set search_path='' as $$
 select exists(select 1 from jsonb_array_elements(a) x,jsonb_array_elements(b) y
 where x->>'field'=y->>'field' and x->>'mode'=y->>'mode' and
 ((x->>'mode'='level' and abs((x->>'level')::integer-(y->>'level')::integer)<=1)
 or (x->>'mode'='time' and abs((x->>'total_minutes')::integer-(y->>'total_minutes')::integer)<=greatest(60,least((x->>'total_minutes')::integer,(y->>'total_minutes')::integer)))))
$$;
create or replace function public.read_posts(p_mode text default 'recommended',p_before timestamptz default null) returns setof public.posts language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); begin
 if p_mode not in ('recommended','similar','following') then raise exception 'invalid_mode'; end if;
 perform private.consume('read_posts',30,3000);
 return query select po.* from public.posts po join public.profiles author on author.id=po.owner_id
 join public.profiles viewer on viewer.id=u
 where private.visible_post(po.owner_id) and (p_before is null or po.created_at<p_before)
 and (p_mode<>'following' or exists(select 1 from private.follows f where f.follower=u and f.following=po.owner_id and f.approved))
 and (p_mode<>'similar' or private.fields_similar(author.learning_fields,viewer.learning_fields))
 order by po.created_at desc,po.id desc limit 20;
end $$;


revoke execute on function private.valid_learning_fields(jsonb),private.fields_similar(jsonb,jsonb) from public,anon,authenticated;
revoke execute on function public.save_profile_fields(text,jsonb,text,text,boolean,text,text) from public,anon;
grant execute on function public.save_profile_fields(text,jsonb,text,text,boolean,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
