begin;
create table private.notification_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 read_until timestamptz not null default now()
);
alter table private.notification_state enable row level security;
revoke all on private.notification_state from public,anon,authenticated;
insert into private.notification_state(user_id) select id from auth.users on conflict do nothing;
create index if not exists comments_owner_time on public.comments(owner_id,created_at desc);
create index if not exists messages_recipient_time on public.messages(recipient,created_at desc);
create function public.read_notifications() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); cutoff timestamptz; snapshot timestamptz:=statement_timestamp(); items jsonb; unread integer; begin
 perform private.consume('notifications_read',30,30000);
 insert into private.notification_state(user_id,read_until) values(u,coalesce((select created_at from public.profiles where id=u),statement_timestamp())) on conflict do nothing;
 select read_until into cutoff from private.notification_state where user_id=u;
 with events as (
 select 'comment'::text kind,c.id::text event_id,c.owner_id actor,c.post_id target,c.created_at happened
 from public.comments c join public.posts p on p.id=c.post_id
 where p.owner_id=u and c.owner_id<>u and private.visible_person(c.owner_id) and private.visible_post(p.owner_id)
 union all
 select 'reaction',r.post_id::text||':'||r.user_id::text,r.user_id,r.post_id,r.created_at
 from private.post_reactions r join public.posts p on p.id=r.post_id
 where p.owner_id=u and r.user_id<>u and private.visible_person(r.user_id) and private.visible_post(p.owner_id)
 union all
 select 'follow',f.follower::text,f.follower,f.follower,f.created_at
 from private.follows f where f.following=u and not f.approved and private.visible_person(f.follower)
 union all
 select 'message',m.id::text,m.sender,m.sender,m.created_at
 from public.messages m where m.recipient=u and not m.deleted and private.visible_person(m.sender)
 ), recent as (
 select e.*,p.display_name from events e join public.profiles p on p.id=e.actor
 where e.happened<=snapshot order by e.happened desc,e.kind,e.event_id limit 100
 ) select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',event_id,'actor',actor,'target',target,'name',display_name,'created_at',happened,'unread',happened>cutoff) order by happened desc,kind,event_id),'[]'::jsonb), count(*) filter(where happened>cutoff)::integer into items,unread from recent;
 return jsonb_build_object('items',items,'unread',unread,'snapshot',snapshot);
end $$;
create function public.mark_notifications_read(p_until timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); begin
 perform private.consume('notifications_seen',10,1000);
 if p_until is null or p_until>statement_timestamp() then raise exception 'invalid_time'; end if;
 insert into private.notification_state(user_id,read_until) values(u,p_until)
 on conflict(user_id) do update set read_until=greatest(private.notification_state.read_until,excluded.read_until);
end $$;
create function public.notification_post(p_post uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.consume('notification_post',30,3000);
 return (select jsonb_build_object('id',p.id,'body',p.body,'owner',p.owner_id,'name',pr.display_name) from public.posts p join public.profiles pr on pr.id=p.owner_id where p.id=p_post and private.visible_post(p.owner_id));
end $$;
revoke all on function public.read_notifications(),public.mark_notifications_read(timestamptz),public.notification_post(uuid) from public,anon;
grant execute on function public.read_notifications(),public.mark_notifications_read(timestamptz),public.notification_post(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
