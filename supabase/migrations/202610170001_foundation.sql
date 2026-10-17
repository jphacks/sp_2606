-- Apply only to a new isolated Supabase project. No service_role in app operations.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create table private.accounts(id uuid primary key references auth.users(id) on delete cascade, suspended boolean not null default false);
create table public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(char_length(display_name) between 1 and 30),
 field text not null default 'Python' check(char_length(field) between 1 and 30),
 level integer not null default 0 check(level between 0 and 3),
 goal text not null default '' check(char_length(goal)<=100),
 bio text not null default '' check(char_length(bio)<=500),
 recommend boolean not null default true,
 created_at timestamptz not null default now()
);
create table private.preferences(id uuid primary key references auth.users(id) on delete cascade,
 visibility text not null default 'mutual' check(visibility in ('public','mutual','private')),
 dm_policy text not null default 'mutual' check(dm_policy in ('mutual','anyone')));
create table private.follows(follower uuid not null references auth.users(id) on delete cascade,
 following uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(),
 primary key(follower,following), check(follower<>following));
create index on private.follows(following);
create table private.blocks(blocker uuid not null references auth.users(id) on delete cascade,
 blocked uuid not null references auth.users(id) on delete cascade, primary key(blocker,blocked), check(blocker<>blocked));
create table private.rate_counters(user_id uuid not null references auth.users(id) on delete cascade,
 action text not null, period timestamptz not null, hits integer not null, primary key(user_id,action,period));
create table public.study_records(id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade, field text not null check(char_length(field) between 1 and 30),
 study_date date not null, minutes integer not null check(minutes between 1 and 1440),
 request_id uuid not null, created_at timestamptz not null default now(), unique(owner_id,request_id));
create index on public.study_records(owner_id,study_date desc);
create table public.posts(id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now());
create index on public.posts(created_at desc);

create function private.active(who uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce((select not suspended from private.accounts where id=who),false)
$$;
create function private.blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from private.blocks where (blocker=a and blocked=b) or (blocker=b and blocked=a))
$$;
create function private.mutual(a uuid,b uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from private.follows where follower=a and following=b)
 and exists(select 1 from private.follows where follower=b and following=a)
$$;
create function private.visible_person(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.active(auth.uid()) and private.active(target) and not private.blocked(auth.uid(),target)
$$;
create function private.visible_post(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select private.visible_person(target) and (target=auth.uid() or exists(
 select 1 from private.preferences where id=target and (visibility='public' or (visibility='mutual' and private.mutual(auth.uid(),target)))))
$$;
create function private.require_active() returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid:=auth.uid(); begin
 if not private.active(u) then raise exception 'not_allowed' using errcode='42501'; end if;
 return u; end $$;
create function private.consume(action_name text, per_minute integer, per_day integer) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); n integer; t timestamptz; begin
 t:=date_trunc('minute',now());
 insert into private.rate_counters values(u,action_name||':minute',t,1)
 on conflict(user_id,action,period) do update set hits=private.rate_counters.hits+1 returning hits into n;
 if n>per_minute then raise exception 'rate_limited' using errcode='P0001'; end if;
 t:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 insert into private.rate_counters values(u,action_name||':day',t,1)
 on conflict(user_id,action,period) do update set hits=private.rate_counters.hits+1 returning hits into n;
 if n>per_day then raise exception 'rate_limited' using errcode='P0001'; end if;
 delete from private.rate_counters where user_id=u and period<now()-interval '2 days';
end $$;

create function private.create_account() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into private.accounts(id) values(new.id);
 insert into public.profiles(id,display_name) values(new.id,'新しい学習者');
 insert into private.preferences(id,visibility) values(new.id,
 case when new.raw_user_meta_data->>'visibility' in ('public','mutual','private') then new.raw_user_meta_data->>'visibility' else 'mutual' end);
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_account();

alter table public.profiles enable row level security;
alter table public.study_records enable row level security;
alter table public.posts enable row level security;
alter table private.accounts enable row level security;
alter table private.preferences enable row level security;
alter table private.follows enable row level security;
alter table private.blocks enable row level security;
alter table private.rate_counters enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(private.visible_person(id));
create policy study_read on public.study_records for select to authenticated using(private.visible_person(owner_id));
create policy posts_read on public.posts for select to authenticated using(private.visible_post(owner_id));
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
grant select on public.profiles,public.study_records,public.posts to authenticated;

create function public.get_settings() returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); result jsonb; begin
 select jsonb_build_object('visibility',visibility,'dm_policy',dm_policy) into result from private.preferences where id=u;
 return result;
end $$;
create function public.save_profile(p_name text,p_field text,p_level integer,p_goal text,p_bio text,p_recommend boolean,p_visibility text,p_dm_policy text) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); begin
 perform private.consume('settings',10,100);
 if p_visibility is null or p_visibility not in ('public','mutual','private') or p_dm_policy is null or p_dm_policy not in ('mutual','anyone') then raise exception 'invalid_settings'; end if;
 update public.profiles set display_name=btrim(p_name),field=btrim(p_field),level=p_level,goal=btrim(p_goal),bio=btrim(p_bio),recommend=p_recommend where id=u;
 update private.preferences set visibility=p_visibility,dm_policy=p_dm_policy where id=u;
end $$;
create function public.record_study(p_field text,p_date date,p_minutes integer,p_request_id uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); result uuid; begin
 -- row lock serializes daily totals for each account, including concurrent requests
 perform 1 from private.accounts where id=u for update;
 select id into result from public.study_records where owner_id=u and request_id=p_request_id;
 if result is not null then return result; end if;
 perform private.consume('study',5,30);
 if p_date is null or p_date>current_date+1 or p_date<current_date-3650 then raise exception 'invalid_date'; end if;
 if (select coalesce(sum(minutes),0) from public.study_records where owner_id=u and study_date=p_date)+p_minutes>1440 then raise exception 'daily_limit'; end if;
 insert into public.study_records(owner_id,field,study_date,minutes,request_id) values(u,btrim(p_field),p_date,p_minutes,p_request_id) returning id into result;
 return result;
end $$;
create function public.remove_study(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); begin perform private.consume('study_delete',10,100); delete from public.study_records where id=p_id and owner_id=u; end $$;
create function public.create_post(p_body text) returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); result uuid; begin
 perform private.consume('post',5,30);
 insert into public.posts(owner_id,body) values(u,btrim(p_body)) returning id into result; return result;
end $$;
create function public.remove_post(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); begin perform private.consume('post_delete',10,100); delete from public.posts where id=p_id and owner_id=u; end $$;
create function public.set_follow(p_target uuid,p_follow boolean) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); begin
 perform 1 from private.accounts where id in (u,p_target) order by id for update;
 if p_target=u or not private.visible_person(p_target) then raise exception 'not_allowed' using errcode='42501'; end if;
 perform private.consume('follow',10,100);
 if p_follow then insert into private.follows(follower,following) values(u,p_target) on conflict do nothing;
 else delete from private.follows where follower=u and following=p_target; end if;
end $$;
create function public.set_block(p_target uuid,p_block boolean) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); begin
 if p_target=u or not private.active(p_target) then raise exception 'not_allowed' using errcode='42501'; end if;
 perform 1 from private.accounts where id in (u,p_target) order by id for update;
 perform private.consume('block',10,100);
 if p_block then
 insert into private.blocks values(u,p_target) on conflict do nothing;
 delete from private.follows where (follower=u and following=p_target) or (follower=p_target and following=u);
 else delete from private.blocks where blocker=u and blocked=p_target; end if;
end $$;
create function public.get_connections() returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); begin
 perform private.consume('connections',30,3000);
 return jsonb_build_object('following',coalesce((select jsonb_agg(following) from private.follows where follower=u),'[]'::jsonb),
 'followers',coalesce((select jsonb_agg(follower) from private.follows where following=u),'[]'::jsonb),
 'blocked',coalesce((select jsonb_agg(blocked) from private.blocks where blocker=u),'[]'::jsonb));
end $$;
create function public.profile_counts(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 perform private.consume('counts',30,3000);
 if not private.visible_person(p_id) then raise exception 'not_allowed' using errcode='42501'; end if;
 return jsonb_build_object('following',(select count(*) from private.follows where follower=p_id), 'followers',(select count(*) from private.follows where following=p_id));
end $$;
create function public.check_read_budget() returns void language plpgsql security definer set search_path = '' as $$
begin perform private.consume('read',30,3000); end $$;

revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.visible_person(uuid),private.visible_post(uuid) to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.get_settings(), public.save_profile(text,text,integer,text,text,boolean,text,text), public.record_study(text,date,integer,uuid), public.remove_study(uuid), public.create_post(text), public.remove_post(uuid), public.set_follow(uuid,boolean), public.set_block(uuid,boolean), public.get_connections(), public.profile_counts(uuid), public.check_read_budget() to authenticated;
-- Direct SELECT is RLS-protected but does not enforce the app's time-window rate budget.
-- Close that bypass by exposing only bounded read RPCs and revoking direct table reads.
create function public.read_profiles() returns setof public.profiles language plpgsql security definer set search_path = '' as $$
begin perform private.consume('read_profiles',30,3000); return query select * from public.profiles where private.visible_person(id) order by (id=auth.uid()) desc,created_at desc limit 100; end $$;
create function public.read_posts(p_mode text default 'recommended',p_before timestamptz default null) returns setof public.posts language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); begin
 if p_mode not in ('recommended','similar','following') then raise exception 'invalid_mode'; end if;
 perform private.consume('read_posts',30,3000);
 return query select po.* from public.posts po join public.profiles author on author.id=po.owner_id
 join public.profiles viewer on viewer.id=u
 where private.visible_post(po.owner_id) and (p_before is null or po.created_at<p_before)
 and (p_mode<>'following' or exists(select 1 from private.follows f where f.follower=u and f.following=po.owner_id))
 and (p_mode<>'similar' or (author.field=viewer.field and abs(author.level-viewer.level)<=1))
 order by po.created_at desc,po.id desc limit 20;
end $$;
create function public.read_study(p_owner uuid,p_from date,p_to date) returns setof public.study_records language plpgsql security definer set search_path = '' as $$
begin
 perform private.consume('read_study',30,3000);
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>31 then raise exception 'invalid_range'; end if;
 if not private.visible_person(p_owner) then return; end if;
 return query select * from public.study_records where owner_id=p_owner and study_date between p_from and p_to order by study_date desc limit 200;
end $$;
revoke all on public.profiles,public.posts,public.study_records from anon,authenticated;
revoke execute on function public.read_profiles(),public.read_posts(text,timestamptz),public.read_study(uuid,date,date) from public,anon;
grant execute on function public.read_profiles(),public.read_posts(text,timestamptz),public.read_study(uuid,date,date) to authenticated;
commit;
