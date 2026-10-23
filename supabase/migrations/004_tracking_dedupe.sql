begin;

alter table public.page_views
  add column if not exists visit_token text;

create unique index if not exists page_views_profile_visit_token
  on public.page_views (profile_id, visit_token)
  where visit_token is not null;

drop function if exists public.track_view(uuid, text, text);

create function public.track_view (
  p_profile_id uuid,
  p_device text,
  p_referrer_hostname text default null,
  p_visit_token text default null
) returns bigint language plpgsql security definer
set search_path = '' as $$
declare
  total bigint;
  inserted boolean := false;
begin
  if p_device is null or p_device not in ('desktop', 'tablet', 'mobile') then
    raise exception 'Invalid device';
  end if;

  if p_referrer_hostname is not null and (
    length(p_referrer_hostname) > 253
    or p_referrer_hostname !~ '^[a-zA-Z0-9][a-zA-Z0-9.-]*$'
  ) then
    raise exception 'Expected referrer hostname only';
  end if;

  if p_visit_token is null
    or length(p_visit_token) < 16
    or length(p_visit_token) > 128
    or p_visit_token !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Invalid visit token';
  end if;

  insert into public.page_views(profile_id, device, referrer_hostname, visit_token)
  select p_profile_id, p_device, p_referrer_hostname, p_visit_token
  where exists (
    select 1
    from public.profiles
    where id = p_profile_id
      and is_public
      and id is distinct from auth.uid()
  )
  on conflict (profile_id, visit_token) where visit_token is not null do nothing;
  inserted := found;

  if inserted then
    update public.profiles
    set view_count = view_count + 1
    where id = p_profile_id
    returning view_count into total;
  else
    select view_count into total
    from public.profiles
    where id = p_profile_id
      and (is_public or id = auth.uid());
  end if;
  return total;
end;
$$;

revoke all on function public.track_view(uuid, text, text, text) from public, anon;
grant execute on function public.track_view(uuid, text, text, text) to anon, authenticated;

commit;
