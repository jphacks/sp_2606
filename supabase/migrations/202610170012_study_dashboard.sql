begin;
create table private.study_memos(
 record_id uuid primary key references public.study_records(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 500)
);
alter table private.study_memos enable row level security;
revoke all on private.study_memos from public,anon,authenticated;
create function public.record_study_with_memo(p_field text,p_date date,p_minutes integer,p_request_id uuid,p_memo text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); result uuid;
begin
 if p_memo is null or char_length(p_memo)>500 then raise exception 'invalid_memo'; end if;
 result:=public.record_study(p_field,p_date,p_minutes,p_request_id);
 if btrim(p_memo)<>'' then
  insert into private.study_memos(record_id,owner_id,body) values(result,u,btrim(p_memo)) on conflict(record_id) do nothing;
 end if;
 return result;
end $$;
revoke execute on function public.record_study_with_memo(text,date,integer,uuid,text) from public,anon;
grant execute on function public.record_study_with_memo(text,date,integer,uuid,text) to authenticated;
create function public.read_study_dashboard(p_owner uuid,p_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; month_end date;
begin
 perform private.require_active();
 if p_month is null or p_month<>date_trunc('month',p_month::timestamp)::date
 or p_month<'1900-01-01'::date or p_month>'2199-12-01'::date then raise exception 'invalid_month'; end if;
 perform private.consume('study_dashboard',30,3000);
 if not private.visible_person(p_owner) then return null; end if;
 month_end:=(p_month+interval '1 month')::date;
 -- Aggregate all rows before limiting the detail list; busy months retain accurate charts.
 select jsonb_build_object(
  'daily',coalesce((select jsonb_agg(x order by x.study_date,x.field) from (
   select r.study_date,r.field,sum(r.minutes)::integer minutes from public.study_records r
   where r.owner_id=p_owner and r.study_date>=p_month-14 and r.study_date<month_end+7
   group by r.study_date,r.field
  ) x),'[]'::jsonb),
  'records',coalesce((select jsonb_agg(x order by x.study_date desc,x.created_at desc,x.id desc) from (
   select r.*,case when p_owner=auth.uid() then m.body else null end memo
   from public.study_records r left join private.study_memos m on m.record_id=r.id where r.owner_id=p_owner and r.study_date>=p_month and r.study_date<month_end
   order by r.study_date desc,r.created_at desc,r.id desc limit 1000
  ) x),'[]'::jsonb),
  'records_truncated',(select count(*)>1000 from public.study_records r where r.owner_id=p_owner and r.study_date>=p_month and r.study_date<month_end)
 ) into result;
 return result;
end $$;
revoke execute on function public.read_study_dashboard(uuid,date) from public,anon;
grant execute on function public.read_study_dashboard(uuid,date) to authenticated;
notify pgrst,'reload schema';
commit;
