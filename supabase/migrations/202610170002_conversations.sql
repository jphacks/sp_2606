begin;
create table public.comments(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts(id) on delete cascade,owner_id uuid not null references auth.users(id) on delete cascade,body text not null check(char_length(btrim(body)) between 1 and 500),created_at timestamptz not null default now());
create index on public.comments(post_id,created_at);
create table private.dm_requests(sender uuid not null references auth.users(id) on delete cascade,recipient uuid not null references auth.users(id) on delete cascade,attempts integer not null check(attempts between 1 and 2),status text not null check(status in ('pending','accepted','rejected')),updated_at timestamptz not null default now(),primary key(sender,recipient),check(sender<>recipient));
create table public.messages(id uuid primary key default gen_random_uuid(),sender uuid not null references auth.users(id) on delete cascade,recipient uuid not null references auth.users(id) on delete cascade,body text check(char_length(btrim(body)) between 1 and 2000),deleted boolean not null default false,request_id uuid not null,created_at timestamptz not null default now(),check(sender<>recipient),check((deleted and body is null) or (not deleted and body is not null)),unique(sender,request_id));
create index on public.messages(sender,recipient,created_at desc);
create index on public.messages(recipient,sender,created_at desc);
alter table public.comments enable row level security;
alter table public.messages enable row level security;
alter table private.dm_requests enable row level security;
create policy comments_read on public.comments for select to authenticated using (private.visible_person(owner_id) and exists(select 1 from public.posts p where p.id=post_id and private.visible_post(p.owner_id)));
create policy messages_read on public.messages for select to authenticated using(private.active(auth.uid()) and auth.uid() in (sender,recipient));
revoke all on public.comments,public.messages,private.dm_requests from anon,authenticated;

create function public.read_comments(p_post uuid) returns setof public.comments language plpgsql security definer set search_path='' as $$
begin
 perform private.consume('comments_read',30,3000);
 if not exists(select 1 from public.posts where id=p_post and private.visible_post(owner_id)) then return; end if;
 return query select * from public.comments where post_id=p_post and private.visible_person(owner_id) order by created_at limit 50;
end $$;
create function public.create_comment(p_post uuid,p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); author uuid; result uuid; begin
 select owner_id into author from public.posts where id=p_post;
 if author is null then raise exception 'not_allowed' using errcode='42501'; end if;
 perform 1 from private.accounts where id in (u,author) order by id for update;
 if not private.visible_post(author) then raise exception 'not_allowed' using errcode='42501'; end if;
 perform private.consume('comment',10,100);
 insert into public.comments(post_id,owner_id,body) values(p_post,u,btrim(p_body)) returning id into result;return result;
end $$;
create function public.remove_comment(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active();begin perform private.consume('comment_delete',10,100);delete from public.comments where id=p_id and owner_id=u;end $$;

create table private.delivery_budget(scope text not null,period timestamptz not null,hits integer not null,primary key(scope,period));
alter table private.delivery_budget enable row level security;
revoke all on private.delivery_budget from public,anon,authenticated;
create function private.delivery_limit(p_scope text,p_limit integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer;begin
 insert into private.delivery_budget values(p_scope,date_trunc('minute',now()),1)
 on conflict(scope,period) do update set hits=private.delivery_budget.hits+1 returning hits into n;
 if n>p_limit then raise exception 'rate_limited';end if;
 delete from private.delivery_budget where scope=p_scope and period<now()-interval '2 days';
end $$;
revoke execute on function private.delivery_limit(text,integer) from public,anon,authenticated;
create function public.send_message(p_recipient uuid,p_body text,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); mode text;state private.dm_requests%rowtype;opposite private.dm_requests%rowtype;result uuid;begin
 if u=p_recipient then raise exception 'not_allowed' using errcode='42501';end if;
 perform 1 from private.accounts where id in(u,p_recipient) order by id for update;
 if not private.active(u) or not private.active(p_recipient) or private.blocked(u,p_recipient) then raise exception 'not_allowed' using errcode='42501';end if;
 select dm_policy into mode from private.preferences where id=p_recipient;
 if mode is null or (mode='mutual' and not private.mutual(u,p_recipient)) then raise exception 'dm_not_allowed' using errcode='42501';end if;
 select id into result from public.messages where sender=u and request_id=p_request_id;
 if result is not null then return result;end if;
 perform private.consume('dm',10,100);
 perform private.delivery_limit('dm-recipient:'||p_recipient::text,30);
 perform private.delivery_limit('dm-global',200);
 -- Both directions share account locks. Pending requests allow exactly one message per attempt.
 if not private.mutual(u,p_recipient) then
 select * into state from private.dm_requests where sender=u and recipient=p_recipient;
 select * into opposite from private.dm_requests where sender=p_recipient and recipient=u;
 if (state.status='accepted' or opposite.status='accepted') then null;
 elsif state.status='pending' or opposite.status='pending' then raise exception 'request_pending';
 elsif state.attempts>=2 then raise exception 'request_limit';
 else
 insert into private.dm_requests(sender,recipient,attempts,status) values(u,p_recipient,1,'pending')
 on conflict(sender,recipient) do update set attempts=private.dm_requests.attempts+1,status='pending',updated_at=now();
 end if;
 end if;
 insert into public.messages(sender,recipient,body,request_id) values(u,p_recipient,btrim(p_body),p_request_id) returning id into result;
 return result;
end $$;
create function public.respond_dm(p_sender uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active();begin
 perform 1 from private.accounts where id in(u,p_sender) order by id for update;
 if not private.active(p_sender) or private.blocked(u,p_sender) then raise exception 'not_allowed' using errcode='42501';end if;
 perform private.consume('dm_response',10,100);
 update private.dm_requests set status=case when p_accept then 'accepted' else 'rejected' end,updated_at=now() where sender=p_sender and recipient=u and status='pending';
end $$;
create function public.read_messages(p_peer uuid) returns setof public.messages language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active();begin
 perform private.consume('dm_read',30,3000);
 -- Blocks stop sending, but participants retain read-only history.
 return query select * from public.messages where (sender=u and recipient=p_peer) or (sender=p_peer and recipient=u) order by created_at desc,id desc limit 50;
end $$;
create function public.read_inbox() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); result jsonb;begin
 perform private.consume('inbox',30,3000);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
 select distinct on (case when m.sender=u then m.recipient else m.sender end)
 m.id,m.sender,m.recipient,m.deleted,m.created_at,
 case when m.sender=u then m.recipient else m.sender end as peer,
 coalesce(p.display_name,'ユーザー') as display_name,
 (select r.status from private.dm_requests r where r.sender=(case when m.sender=u then m.recipient else m.sender end) and r.recipient=u) as incoming_status
 from public.messages m left join public.profiles p on p.id=(case when m.sender=u then m.recipient else m.sender end) and private.visible_person(p.id)
 where m.sender=u or m.recipient=u
 order by (case when m.sender=u then m.recipient else m.sender end),m.created_at desc limit 100
 ) x;return result;
end $$;
create function public.remove_message(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active();begin
 perform private.consume('dm_delete',10,100);
 update public.messages set body=null,deleted=true where id=p_id and sender=u;
end $$;
create or replace function public.set_block(p_target uuid,p_block boolean) returns void language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.require_active(); begin
 if p_target=u or not private.active(p_target) then raise exception 'not_allowed' using errcode='42501'; end if;
 perform 1 from private.accounts where id in (u,p_target) order by id for update;
 perform private.consume('block',10,100);
 if p_block then
 insert into private.blocks values(u,p_target) on conflict do nothing;
 delete from private.follows where (follower=u and following=p_target) or (follower=p_target and following=u);
 update private.dm_requests set status='rejected',updated_at=now() where (sender=u and recipient=p_target) or (sender=p_target and recipient=u);
 else delete from private.blocks where blocker=u and blocked=p_target; end if;
end $$;
revoke execute on function public.read_comments(uuid),public.create_comment(uuid,text),public.remove_comment(uuid),public.send_message(uuid,text,uuid),public.respond_dm(uuid,boolean),public.read_messages(uuid),public.read_inbox(),public.remove_message(uuid) from public,anon;
grant execute on function public.read_comments(uuid),public.create_comment(uuid,text),public.remove_comment(uuid),public.send_message(uuid,text,uuid),public.respond_dm(uuid,boolean),public.read_messages(uuid),public.read_inbox(),public.remove_message(uuid) to authenticated;
commit;
begin;
create function public.dm_status(p_peer uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); policy text; outgoing private.dm_requests%rowtype; incoming private.dm_requests%rowtype; can_contact boolean;begin
 perform private.consume('dm_status',30,3000);
 select dm_policy into policy from private.preferences where id=p_peer;
 select * into outgoing from private.dm_requests where sender=u and recipient=p_peer;
 select * into incoming from private.dm_requests where sender=p_peer and recipient=u;
 can_contact:=u<>p_peer and private.active(p_peer) and not private.blocked(u,p_peer)
 and (policy='anyone' or private.mutual(u,p_peer));
 return jsonb_build_object('can_contact',coalesce(can_contact,false),'mutual',private.mutual(u,p_peer),
 'outgoing_status',outgoing.status,'incoming_status',incoming.status,'attempts',coalesce(outgoing.attempts,0),
 'can_send',coalesce(can_contact and (private.mutual(u,p_peer) or outgoing.status='accepted' or incoming.status='accepted' or (outgoing.status is distinct from 'pending' and incoming.status is distinct from 'pending' and coalesce(outgoing.attempts,0)<2)),false));
end $$;
revoke execute on function public.dm_status(uuid) from public,anon;
grant execute on function public.dm_status(uuid) to authenticated;
commit;
