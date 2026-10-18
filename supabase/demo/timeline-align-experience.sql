begin;
with fixed as (
 select p.id,jsonb_agg(case when c.kind='certification' then jsonb_build_object('field',f->>'field','mode','time','level',null,'total_minutes',coalesce((f->>'total_minutes')::integer,1200))
 when c.kind='technology' then jsonb_build_object('field',f->>'field','mode','level','level',coalesce((f->>'level')::integer,1),'total_minutes',null) else f end order by ord) fields
 from public.profiles p join private.demo_seed_users d on d.user_id=p.id and d.batch='timeline-demo-20261017-v1'
 join auth.users u on u.id=p.id and u.raw_user_meta_data->>'costep_demo_batch'=d.batch
 cross join lateral jsonb_array_elements(p.learning_fields) with ordinality j(f,ord)
 left join private.goal_catalog c on f->>'field'=case c.id when 'cert-ipa-fe' then '基本情報' when 'cert-ipa-ap' then '応用情報' when 'tech-aws' then 'AWS' else case when length(c.label)<=30 then c.label else c.id end end
 group by p.id
)
update public.profiles p set learning_fields=f.fields,level=coalesce((f.fields->0->>'level')::integer,0) from fixed f where p.id=f.id;
update public.profiles p set attributes=jsonb_build_object('background',case when right(p.id::text,1) in ('0','2','4','6','8') then 'humanities' else 'science' end,'university','','faculty','','work','','prefecture','')
from private.demo_seed_users d join auth.users u on u.id=d.user_id and u.raw_user_meta_data->>'costep_demo_batch'=d.batch
where p.id=d.user_id and d.batch='timeline-demo-20261017-v1';
commit;
select count(*) as demo_users from private.demo_seed_users where batch='timeline-demo-20261017-v1';
