begin;
create or replace function public.set_post_reaction(p_post uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); author uuid; begin
 if p_enabled is null then raise exception 'invalid_reaction'; end if;
 select owner_id into author from public.posts where id=p_post;
 if author is null or (p_enabled and author=u) then raise exception 'not_allowed' using errcode='42501'; end if;
 perform 1 from private.accounts where id in(u,author) order by id for update;
 if not private.visible_post(author) then raise exception 'not_allowed' using errcode='42501'; end if;
 perform private.consume('reaction',30,500);
 if p_enabled then insert into private.post_reactions(post_id,user_id) values(p_post,u) on conflict do nothing;
 else delete from private.post_reactions where post_id=p_post and user_id=u; end if;
end $$;
create or replace function public.read_post_reactions(p_posts uuid[]) returns table(post_id uuid,total bigint,liked boolean)
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); begin
 if p_posts is null or cardinality(p_posts)>20 or array_position(p_posts,null) is not null then raise exception 'invalid_posts'; end if;
 perform private.consume('reactions_read',30,3000);
 return query select p.id,count(r.user_id),coalesce(bool_or(r.user_id=u),false)
 from public.posts p left join private.post_reactions r on r.post_id=p.id and r.user_id<>p.owner_id and private.visible_person(r.user_id)
 where p.id=any(p_posts) and private.visible_post(p.owner_id)
 group by p.id;
end $$;
notify pgrst,'reload schema';
commit;
