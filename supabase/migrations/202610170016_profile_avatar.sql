begin;
-- One bounded JPEG per account. No original files or public object URLs.
create table private.profile_avatars (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 image bytea not null check(octet_length(image) between 4 and 49152),
 updated_at timestamptz not null default now()
);
alter table private.profile_avatars enable row level security;
revoke all on private.profile_avatars from public,anon,authenticated;
create function public.set_profile_avatar(p_image text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_active(); b bytea;
begin
 perform private.consume('set_profile_avatar',5,30);
 if p_image is null then delete from private.profile_avatars where owner_id=u; return; end if;
 if length(p_image)>65536 or p_image !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'invalid_image'; end if;
 b:=decode(p_image,'base64');
 if octet_length(b) not between 4 and 49152 or substring(b from 1 for 3)<>decode('ffd8ff','hex') or substring(b from octet_length(b)-1 for 2)<>decode('ffd9','hex') then raise exception 'invalid_image'; end if;
 insert into private.profile_avatars(owner_id,image) values(u,b)
 on conflict(owner_id) do update set image=excluded.image,updated_at=now();
end $$;
create function public.read_profile_avatar(p_owner uuid) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_active();
 perform private.consume('read_profile_avatar',300,30000);
 if not private.visible_person(p_owner) then return null; end if;
 return (select encode(image,'base64') from private.profile_avatars where owner_id=p_owner);
end $$;
revoke execute on function public.set_profile_avatar(text),public.read_profile_avatar(uuid) from public,anon;
grant execute on function public.set_profile_avatar(text),public.read_profile_avatar(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
