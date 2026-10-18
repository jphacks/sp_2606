begin;
create function public.read_comment_counts(p_posts uuid[]) returns table(post_id uuid,total bigint)
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_active();
 if p_posts is null or cardinality(p_posts)>20 or array_position(p_posts,null) is not null then raise exception 'invalid_posts'; end if;
 perform private.consume('comment_counts',30,3000);
 return query select p.id,count(c.id)
 from public.posts p left join public.comments c on c.post_id=p.id and private.visible_person(c.owner_id)
 where p.id=any(p_posts) and private.visible_post(p.owner_id) group by p.id;
end $$;
revoke execute on function public.read_comment_counts(uuid[]) from public,anon;
grant execute on function public.read_comment_counts(uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
