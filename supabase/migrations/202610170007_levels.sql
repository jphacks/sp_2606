-- Current proficiency: 0..4. Target proficiency remains 1..4.
-- Existing numeric levels and cumulative study times are preserved.
begin;
alter table public.profiles drop constraint profiles_level_check;
alter table public.profiles add constraint profiles_level_check check(level between 0 and 4);
create or replace function private.valid_learning_fields(items jsonb) returns boolean language plpgsql immutable set search_path='' as $$
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
   if jsonb_typeof(item->'level')<>'number' or (item->>'level') !~ '^[0-4]$' or item->'total_minutes'<>'null'::jsonb then return false; end if;
  elsif item->>'mode'='time' then
   if item->'level'<>'null'::jsonb or jsonb_typeof(item->'total_minutes')<>'number' then return false; end if;
   if (item->>'total_minutes') !~ '^[0-9]{1,7}$' then return false; end if;
   if (item->>'total_minutes')::bigint>6000000 then return false; end if;
  else return false; end if;
 end loop;
 return true;
end $$;
create or replace function private.recommendation_score(viewer public.profiles,candidate public.profiles)
returns double precision language sql stable set search_path='' as $$
 select coalesce((select max(100 + case
 when a->>'mode'='level' and b->>'mode'='level' then greatest(0,4-abs((a->>'level')::integer-(b->>'level')::integer))*7.5
 when a->>'mode'='time' and b->>'mode'='time' then 30.0/(1+abs(ln(((a->>'total_minutes')::double precision+60)/((b->>'total_minutes')::double precision+60))))
 else 0 end)
 from jsonb_array_elements(viewer.learning_fields) a,jsonb_array_elements(candidate.learning_fields) b
 where a->>'field'=b->>'field'),0) + private.goal_similarity(viewer.goals,candidate.goals)
$$;
notify pgrst,'reload schema';
commit;
