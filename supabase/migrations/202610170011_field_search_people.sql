begin;
-- Match people by their declared field, then show their public learning records.
create or replace function public.search_field_studies(p_field text)
returns table(id uuid,owner_id uuid,field text,study_date date,minutes integer,display_name text)
language plpgsql security definer set search_path = '' as $$
begin
 perform private.require_active();
 if p_field is null or length(p_field)<1 or length(p_field)>30 then raise exception 'invalid_field'; end if;
 perform private.consume('field_search',30,3000);
 return query select r.id,r.owner_id,r.field,r.study_date,r.minutes,p.display_name
 from public.study_records r join public.profiles p on p.id=r.owner_id
 where private.visible_person(r.owner_id)
 and exists(select 1 from jsonb_array_elements(p.learning_fields) f where f->>'field'=p_field)
 and r.study_date between current_date-30 and current_date
 order by r.study_date desc,r.created_at desc,r.id desc limit 50;
end $$;
notify pgrst,'reload schema';
commit;
