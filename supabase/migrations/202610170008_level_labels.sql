-- Both current and target levels display Lv.1..Lv.5, stored as 0..4.
-- Existing current levels and target levels keep their ordinal meaning; no rows are rewritten.
begin;
create or replace function private.valid_goals(items jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare item jsonb; names text[]:='{}'; kind text; begin
 if items is null or jsonb_typeof(items)<>'array' then return false; end if;
 if jsonb_array_length(items)>5 then return false; end if;
 for item in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(item)<>'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(item))<>4 or not(item ?& array['catalog_id','start_month','target_month','target_level']) then return false; end if;
  if jsonb_typeof(item->'catalog_id')<>'string' or jsonb_typeof(item->'start_month')<>'string' or jsonb_typeof(item->'target_month')<>'string' then return false; end if;
  if item->>'catalog_id'=any(names) then return false; end if;
  names:=array_append(names,item->>'catalog_id');
  select c.kind into kind from private.goal_catalog c where c.id=item->>'catalog_id' and c.active;
  if kind is null then return false; end if;
  if (item->>'start_month') !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' or (item->>'target_month') !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' then return false; end if;
  if item->>'start_month'>item->>'target_month' then return false; end if;
  if kind='certification' then
   if item->'target_level'<>'null'::jsonb then return false; end if;
  else
   if jsonb_typeof(item->'target_level')<>'number' or (item->>'target_level') !~ '^[0-4]$' then return false; end if;
  end if;
 end loop;
 return true;
end $$;
create or replace function private.goal_similarity(a jsonb,b jsonb) returns double precision language sql stable security definer set search_path='' as $$
 select coalesce(max(20 + 10.0*least(private.goal_months(x),private.goal_months(y))/greatest(private.goal_months(x),private.goal_months(y))
 +case when c.kind='technology' then greatest(0,4-abs((x->>'target_level')::integer-(y->>'target_level')::integer))*10.0/4 else 0 end),0)::double precision
 from jsonb_array_elements(a) x,jsonb_array_elements(b) y,private.goal_catalog c
 where x->>'catalog_id'=y->>'catalog_id' and c.id=x->>'catalog_id' and c.active
$$;
notify pgrst,'reload schema';
commit;
