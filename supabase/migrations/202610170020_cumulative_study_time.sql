begin;
create table private.study_time_contributions (
 record_id uuid primary key references public.study_records(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 field text not null,
 minutes integer not null check(minutes>0)
);
alter table private.study_time_contributions enable row level security;
revoke all on private.study_time_contributions from public,anon,authenticated;
create function private.adjust_profile_time(u uuid,field_key text,delta integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update public.profiles p set learning_fields=(select jsonb_agg(case when f->>'field'=field_key and f->>'mode'='time' then jsonb_set(f,'{total_minutes}',to_jsonb(greatest(0,(f->>'total_minutes')::integer+delta))) else f end order by ord) from jsonb_array_elements(p.learning_fields) with ordinality j(f,ord))
 where p.id=u and exists(select 1 from jsonb_array_elements(p.learning_fields) f where f->>'field'=field_key and f->>'mode'='time');
 get diagnostics changed = row_count;
 return changed>0;
end $$;
create function private.sync_study_profile_time() returns trigger language plpgsql security definer set search_path='' as $$
declare old_contribution private.study_time_contributions; u uuid;
begin
 u:=case when tg_op='DELETE' then old.owner_id else new.owner_id end;
 perform 1 from private.accounts where id=u for update;
 if tg_op<>'INSERT' then
  select * into old_contribution from private.study_time_contributions where record_id=old.id;
  if found then
   perform private.adjust_profile_time(old_contribution.owner_id,old_contribution.field,-old_contribution.minutes);
   delete from private.study_time_contributions where record_id=old.id;
  end if;
 end if;
 if tg_op<>'DELETE' and private.adjust_profile_time(new.owner_id,new.field,new.minutes) then
  insert into private.study_time_contributions(record_id,owner_id,field,minutes) values(new.id,new.owner_id,new.field,new.minutes);
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger study_time_added after insert on public.study_records for each row execute function private.sync_study_profile_time();
create trigger study_time_removed before delete on public.study_records for each row execute function private.sync_study_profile_time();
create trigger study_time_changed after update of minutes,field,owner_id on public.study_records for each row execute function private.sync_study_profile_time();
revoke execute on function private.adjust_profile_time(uuid,text,integer),private.sync_study_profile_time() from public,anon,authenticated;
create or replace function public.save_profile_fields(p_name text,p_fields jsonb,p_goal text,p_bio text,p_recommend boolean,p_visibility text,p_dm_policy text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); first_item jsonb; begin
 perform 1 from private.accounts where id=u for update;
 perform private.consume('settings',10,100);
 if not private.valid_field_modes(p_fields) or not private.valid_learning_fields(p_fields) then raise exception 'invalid_learning_fields'; end if;
 if p_visibility is null or p_visibility not in('public','mutual','private') or p_dm_policy is null or p_dm_policy not in('mutual','anyone') then raise exception 'invalid_settings'; end if;
 delete from private.study_time_contributions c where c.owner_id=u and not exists(select 1 from jsonb_array_elements(p_fields) f where f->>'field'=c.field and f->>'mode'='time');
 first_item:=p_fields->0;
 update public.profiles set display_name=btrim(p_name),learning_fields=p_fields,
 field=first_item->>'field',level=coalesce((first_item->>'level')::integer,0),
 goal=btrim(p_goal),bio=btrim(p_bio),recommend=p_recommend where id=u;
 update private.preferences set visibility=p_visibility,dm_policy=p_dm_policy,profile_completed=true where id=u;
end $$;
create or replace function public.remove_study(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active();
begin
 perform 1 from private.accounts where id=u for update;
 perform private.consume('study_delete',10,100);
 delete from public.study_records where id=p_id and owner_id=u;
end $$;
notify pgrst,'reload schema';
commit;
