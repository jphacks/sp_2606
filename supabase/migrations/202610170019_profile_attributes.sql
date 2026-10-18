begin;
create function private.valid_profile_attributes(a jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(a)='object' and (select count(*) from jsonb_object_keys(a))=5
 and a ?& array['background','university','faculty','work','prefecture']
 and a->>'background' in ('humanities','science')
 and jsonb_typeof(a->'university')='string' and length(a->>'university')<=100
 and jsonb_typeof(a->'faculty')='string' and length(a->>'faculty')<=100
 and jsonb_typeof(a->'work')='string' and length(a->>'work')<=300
 and jsonb_typeof(a->'prefecture')='string' and a->>'prefecture'=any(array['','北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県']),false)
$$;
revoke execute on function private.valid_profile_attributes(jsonb) from public,anon,authenticated;
alter table public.profiles add column attributes jsonb default null check(attributes is null or private.valid_profile_attributes(attributes));
create function public.save_profile_complete(p_name text,p_fields jsonb,p_goals jsonb,p_bio text,p_recommend boolean,p_visibility text,p_dm_policy text,p_attributes jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active();
begin
 if not private.valid_profile_attributes(p_attributes) then raise exception 'invalid_attributes'; end if;
 perform public.save_profile_goals(p_name,p_fields,p_goals,p_bio,p_recommend,p_visibility,p_dm_policy);
 update public.profiles set attributes=p_attributes where id=u;
end $$;
revoke execute on function public.save_profile_complete(text,jsonb,jsonb,text,boolean,text,text,jsonb) from public,anon;
grant execute on function public.save_profile_complete(text,jsonb,jsonb,text,boolean,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
