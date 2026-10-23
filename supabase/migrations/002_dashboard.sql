-- Phase 2: preserve the deployed Phase 1 columns and existing asset URLs.
begin;

-- Existing long bios remain readable; new edits must meet the 160-character limit.
alter table public.profiles
  add constraint profiles_bio_160 check (char_length(bio) <= 160) not valid;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

create policy media_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'media');

create policy media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Serialize editor changes per owner and keep pin/reorder operations atomic.
create function public.set_featured_link(p_link_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'Authentication required';
  end if;

  perform 1 from public.profiles where id = owner_id for update;
  if p_link_id is not null and not exists (
    select 1 from public.links where id = p_link_id and profile_id = owner_id
  ) then
    raise exception 'Link not found';
  end if;

  update public.links set is_pinned = false
  where profile_id = owner_id and is_pinned;

  update public.links set is_pinned = true
  where profile_id = owner_id and id = p_link_id;
end;
$$;

create function public.reorder_links(p_link_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  total integer;
begin
  if owner_id is null then
    raise exception 'Authentication required';
  end if;

  perform 1 from public.profiles where id = owner_id for update;
  select count(*) into total from public.links where profile_id = owner_id;

  if p_link_ids is null
    or cardinality(p_link_ids) <> total
    or (select count(distinct item) from unnest(p_link_ids) as item) <> total
    or exists (
      select 1 from unnest(p_link_ids) as item
      where not exists (
        select 1 from public.links where id = item and profile_id = owner_id
      )
    ) then
    raise exception 'Links changed. Refresh and try again.';
  end if;

  update public.links as link
  set position = ordered.ordinality - 1
  from unnest(p_link_ids) with ordinality as ordered(id, ordinality)
  where link.id = ordered.id and link.profile_id = owner_id;
end;
$$;

revoke all on function public.set_featured_link(uuid), public.reorder_links(uuid[]) from public, anon;
grant execute on function public.set_featured_link(uuid), public.reorder_links(uuid[]) to authenticated;

commit;
