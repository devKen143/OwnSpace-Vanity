begin;

-- Keep legacy usernames/bios readable without blocking unrelated updates.
alter table public.profiles drop constraint profiles_bio_160;
alter table public.profiles add column deletion_pending boolean not null default false;

create function public.validate_profile_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.username is distinct from old.username then
    if new.username !~ '^[a-z0-9_]{3,20}$' or new.username in (
      'admin', 'login', 'signup', 'dashboard', 'settings', 'api', 'www', 'help',
      'reset-password', 'account', 'auth'
    ) then
      raise exception 'Use an available username with 3–20 lowercase letters, numbers, or underscores.';
    end if;
  end if;
  if tg_op = 'INSERT' or new.bio is distinct from old.bio then
    if char_length(new.bio) > 160 then
      raise exception 'Bio must be at most 160 characters.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_profile_changes() from public, anon, authenticated;
create trigger validate_profile_changes before insert or update on public.profiles
for each row execute function public.validate_profile_changes();

create or replace function public.is_username_available(p_username text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    p_username ~ '^[a-z0-9_]{3,20}$'
    and p_username not in (
      'admin', 'login', 'signup', 'dashboard', 'settings', 'api', 'www', 'help',
      'reset-password', 'account', 'auth'
    )
    and not exists(select 1 from public.profiles where username = p_username),
    false
  );
$$;

-- A deletion in progress cannot be republished or receive new uploads.
-- Only the Edge Function's server-side admin client may set deletion_pending.
create policy profiles_not_deleting on public.profiles as restrictive
for update to authenticated using (not deletion_pending) with check (not deletion_pending);

create policy media_active_owner_insert on storage.objects as restrictive
for insert to authenticated with check (
  bucket_id not in ('media', 'profile-assets') or exists (
    select 1 from public.profiles where id = (select auth.uid()) and not deletion_pending
  )
);
create policy media_active_owner_update on storage.objects as restrictive
for update to authenticated using (
  bucket_id not in ('media', 'profile-assets') or exists (
    select 1 from public.profiles where id = (select auth.uid()) and not deletion_pending
  )
) with check (
  bucket_id not in ('media', 'profile-assets') or exists (
    select 1 from public.profiles where id = (select auth.uid()) and not deletion_pending
  )
);

create function public.get_analytics(p_range text default '7d')
returns jsonb language plpgsql stable security definer
set search_path = '' set timezone = 'UTC' as $$
declare
  owner_id uuid := auth.uid();
  end_time timestamptz := now();
  start_time timestamptz;
  first_time timestamptz;
  bucket text;
  step interval;
  result jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_range is null or p_range not in ('24h', '7d', '30d', 'all') then
    raise exception 'Invalid analytics range';
  end if;
  start_time := case p_range
    when '24h' then end_time - interval '24 hours'
    when '7d' then end_time - interval '7 days'
    when '30d' then end_time - interval '30 days'
    else '-infinity'::timestamptz
  end;

  select min(created_at) into first_time
  from public.page_views where profile_id = owner_id and created_at <= end_time;
  first_time := case when p_range = 'all' then coalesce(first_time, end_time) else start_time end;
  bucket := case
    when p_range = '24h' then 'hour'
    when p_range = 'all' and first_time < end_time - interval '366 days' then 'month'
    else 'day'
  end;
  step := case bucket when 'hour' then interval '1 hour' when 'month' then interval '1 month' else interval '1 day' end;

  with views as materialized (
    select device, created_at from public.page_views
    where profile_id = owner_id and created_at >= start_time and created_at <= end_time
  ), clicks as materialized (
    select link_id, social_id from public.click_events
    where profile_id = owner_id and created_at >= start_time and created_at <= end_time
  ), totals as (
    select (select count(*) from views) as views, (select count(*) from clicks) as clicks
  ), series as (
    select point as at, count(v.created_at) as views
    from generate_series(date_trunc(bucket, first_time), date_trunc(bucket, end_time), step) point
    left join views v on date_trunc(bucket, v.created_at) = point
    group by point order by point
  ), devices as (
    select device, count(*) as views from views group by device order by count(*) desc, device
  ), top_links as (
    select l.id, l.title as label, count(*) as clicks from clicks c
    join public.links l on l.id = c.link_id and l.profile_id = owner_id
    group by l.id, l.title order by count(*) desc, l.title, l.id limit 10
  ), top_socials as (
    select s.id, s.platform as label, count(*) as clicks from clicks c
    join public.socials s on s.id = c.social_id and s.profile_id = owner_id
    group by s.id, s.platform order by count(*) desc, s.platform, s.id limit 10
  )
  select jsonb_build_object(
    'range', p_range, 'bucket', bucket,
    'views', totals.views, 'clicks', totals.clicks,
    'ctr', case when totals.views = 0 then 0 else round(totals.clicks * 100.0 / totals.views, 2) end,
    'series', coalesce((select jsonb_agg(to_jsonb(series) order by at) from series), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(devices) order by views desc, device) from devices), '[]'::jsonb),
    'top_links', coalesce((select jsonb_agg(to_jsonb(top_links) order by clicks desc, label, id) from top_links), '[]'::jsonb),
    'top_socials', coalesce((select jsonb_agg(to_jsonb(top_socials) order by clicks desc, label, id) from top_socials), '[]'::jsonb)
  ) into result from totals;
  return result;
end;
$$;
revoke all on function public.get_analytics(text) from public, anon;
grant execute on function public.get_analytics(text) to authenticated;

commit;
