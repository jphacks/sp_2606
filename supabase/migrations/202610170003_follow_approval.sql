-- Approval is directional. Existing follows require consent again; no automatic follow-back.
begin;
alter table private.follows add column approved boolean not null default false;
alter table private.preferences add column profile_completed boolean not null default false;
update private.preferences s set profile_completed=true from public.profiles p where p.id=s.id and p.display_name<>'新しい学習者';
create or replace function private.mutual(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.follows where follower=a and following=b and approved)
 and exists(select 1 from private.follows where follower=b and following=a and approved)
$$;
create or replace function public.set_follow(p_target uuid,p_follow boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); begin
 perform 1 from private.accounts where id in(u,p_target) order by id for update;
 if u=p_target or not private.visible_person(p_target) then raise exception 'not_allowed' using errcode='42501'; end if;
 perform private.consume('follow',10,100);
 if p_follow then insert into private.follows(follower,following) values(u,p_target) on conflict do nothing;
 else delete from private.follows where follower=u and following=p_target; end if;
end $$;
create function public.respond_follow(p_sender uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); begin
 perform 1 from private.accounts where id in(u,p_sender) order by id for update;
 if u=p_sender or not private.visible_person(p_sender) then raise exception 'not_allowed' using errcode='42501'; end if;
 perform private.consume('follow_response',10,100);
 if not exists(select 1 from private.follows where follower=p_sender and following=u and not approved) then raise exception 'no_pending_request'; end if;
 if p_accept then update private.follows set approved=true where follower=p_sender and following=u;
 else delete from private.follows where follower=p_sender and following=u; end if;
end $$;
create or replace function public.get_connections() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); begin
 perform private.consume('connections',30,3000);
 return jsonb_build_object(
 'following',coalesce((select jsonb_agg(following) from private.follows where follower=u and approved),'[]'::jsonb),
 'followers',coalesce((select jsonb_agg(follower) from private.follows where following=u and approved),'[]'::jsonb),
 'outgoing',coalesce((select jsonb_agg(following) from private.follows where follower=u and not approved),'[]'::jsonb),
 'incoming',coalesce((select jsonb_agg(follower) from private.follows where following=u and not approved and private.visible_person(follower)),'[]'::jsonb),
 'blocked',coalesce((select jsonb_agg(blocked) from private.blocks where blocker=u),'[]'::jsonb));
end $$;
create or replace function public.profile_counts(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.consume('counts',30,3000);
 if not private.visible_person(p_id) then raise exception 'not_allowed' using errcode='42501'; end if;
 return jsonb_build_object('following',(select count(*) from private.follows where follower=p_id and approved),
 'followers',(select count(*) from private.follows where following=p_id and approved));
end $$;
create function public.read_profile(p_id uuid) returns setof public.profiles language plpgsql security definer set search_path='' as $$
begin perform private.consume('read_profile',30,3000); return query select * from public.profiles where id=p_id and private.visible_person(id); end $$;
create function public.read_profile_posts(p_id uuid) returns setof public.posts language plpgsql security definer set search_path='' as $$
begin perform private.consume('read_profile_posts',30,3000); return query select * from public.posts where owner_id=p_id and private.visible_post(owner_id) order by created_at desc,id desc limit 20; end $$;
create or replace function public.get_settings() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); result jsonb; begin
 select jsonb_build_object('visibility',visibility,'dm_policy',dm_policy,'profile_completed',profile_completed) into result from private.preferences where id=u; return result;
end $$;
create or replace function public.save_profile(p_name text,p_field text,p_level integer,p_goal text,p_bio text,p_recommend boolean,p_visibility text,p_dm_policy text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); begin
 perform private.consume('settings',10,100);
 if p_visibility is null or p_visibility not in('public','mutual','private') or p_dm_policy is null or p_dm_policy not in('mutual','anyone') then raise exception 'invalid_settings'; end if;
 update public.profiles set display_name=btrim(p_name),field=btrim(p_field),level=p_level,goal=btrim(p_goal),bio=btrim(p_bio),recommend=p_recommend where id=u;
 update private.preferences set visibility=p_visibility,dm_policy=p_dm_policy,profile_completed=true where id=u;
end $$;
create or replace function private.create_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.accounts(id) values(new.id);
 insert into public.profiles(id,display_name) values(new.id,'新しい学習者');
 insert into private.preferences(id,visibility) values(new.id,'mutual');
 return new;
end $$;
create or replace function public.create_post(p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); result uuid; begin
 if not exists(select 1 from private.preferences where id=u and profile_completed) then raise exception 'profile_required'; end if;
 perform private.consume('post',5,30);
 insert into public.posts(owner_id,body) values(u,btrim(p_body)) returning id into result; return result;
end $$;
create or replace function public.read_posts(p_mode text default 'recommended',p_before timestamptz default null) returns setof public.posts language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); begin
 if p_mode not in ('recommended','similar','following') then raise exception 'invalid_mode'; end if;
 perform private.consume('read_posts',30,3000);
 return query select po.* from public.posts po join public.profiles author on author.id=po.owner_id
 join public.profiles viewer on viewer.id=u
 where private.visible_post(po.owner_id) and (p_before is null or po.created_at<p_before)
 and (p_mode<>'following' or exists(select 1 from private.follows f where f.follower=u and f.following=po.owner_id and f.approved))
 and (p_mode<>'similar' or (author.field=viewer.field and abs(author.level-viewer.level)<=1))
 order by po.created_at desc,po.id desc limit 20;
end $$;

revoke execute on function public.respond_follow(uuid,boolean),public.read_profile(uuid),public.read_profile_posts(uuid) from public,anon;
grant execute on function public.respond_follow(uuid,boolean),public.read_profile(uuid),public.read_profile_posts(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
