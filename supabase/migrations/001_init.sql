-- Run once in a new Supabase project. Profiles are created atomically with auth users.
begin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (
    username ~ '^[a-z0-9_]{3,24}$'
    and username not in (
      'login',
      'signup',
      'reset-password',
      'account',
      'admin',
      'api',
      'www',
      'settings',
      'dashboard',
      'auth'
    )
  ),
  display_name text not null default '' check (char_length(display_name) <= 80),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_url text,
  is_public boolean not null default true,
  layout text not null default 'centered' check (layout in ('centered', 'split')),
  background_type text not null default 'color' check (background_type in ('color', 'gradient', 'image')),
  background_color text not null default '#f6f3ec' check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  gradient_to text not null default '#d5e9de' check (gradient_to ~ '^#[0-9a-fA-F]{6}$'),
  background_image text,
  accent_color text not null default '#305b43' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  text_color text not null default '#203629' check (text_color ~ '^#[0-9a-fA-F]{6}$'),
  font text not null default 'DM Sans' check (
    font in (
      'DM Sans',
      'Inter',
      'Lora',
      'Space Grotesk',
      'Manrope'
    )
  ),
  splash_enabled boolean not null default false,
  splash_title text not null default 'Welcome to my space' check (char_length(splash_title) <= 120),
  splash_message text not null default '' check (char_length(splash_message) <= 500),
  view_count bigint not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now()
);

create table public.links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  url text not null check (url ~ '^https?://'),
  is_pinned boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index links_profile_position on public.links (profile_id, position);

create unique index one_pinned_link_per_profile on public.links (profile_id)
where
  is_pinned;

create table public.socials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (char_length(platform) between 1 and 40),
  value text not null check (char_length(value) between 1 and 2000),
  mode text not null default 'link' check (mode in ('link', 'copy')),
  position integer not null default 0,
  check (
    mode = 'copy'
    or value ~ '^https?://'
  )
);

create index socials_profile_position on public.socials (profile_id, position);

create table public.page_views (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  device text not null check (device in ('desktop', 'tablet', 'mobile')),
  referrer_hostname text,
  created_at timestamptz not null default now()
);

create index page_views_profile_date on public.page_views (profile_id, created_at);

create table public.click_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  link_id uuid references public.links (id) on delete cascade,
  social_id uuid references public.socials (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls (link_id, social_id) = 1)
);

create index click_events_profile_date on public.click_events (profile_id, created_at);

alter table public.profiles enable row level security;

alter table public.links enable row level security;

alter table public.socials enable row level security;

alter table public.page_views enable row level security;

alter table public.click_events enable row level security;

create policy profiles_read on public.profiles for
select
  using (
    is_public
    or id = (
      select
        auth.uid ()
    )
  );

create policy profiles_update on public.profiles
for update
  to authenticated using (
    id = (
      select
        auth.uid ()
    )
  )
with
  check (
    id = (
      select
        auth.uid ()
    )
  );

create policy links_read on public.links for
select
  using (
    exists (
      select
        1
      from
        public.profiles p
      where
        p.id = profile_id
        and (
          p.is_public
          or p.id = (
            select
              auth.uid ()
          )
        )
    )
  );

create policy links_owner on public.links for all to authenticated using (
  profile_id = (
    select
      auth.uid ()
  )
)
with
  check (
    profile_id = (
      select
        auth.uid ()
    )
  );

create policy socials_read on public.socials for
select
  using (
    exists (
      select
        1
      from
        public.profiles p
      where
        p.id = profile_id
        and (
          p.is_public
          or p.id = (
            select
              auth.uid ()
          )
        )
    )
  );

create policy socials_owner on public.socials for all to authenticated using (
  profile_id = (
    select
      auth.uid ()
  )
)
with
  check (
    profile_id = (
      select
        auth.uid ()
    )
  );

create policy views_owner_read on public.page_views for
select
  to authenticated using (
    profile_id = (
      select
        auth.uid ()
    )
  );

create policy clicks_owner_read on public.click_events for
select
  to authenticated using (
    profile_id = (
      select
        auth.uid ()
    )
  );

-- Explicit column privileges keep owners from forging counters or changing identity.
revoke all on public.profiles,
public.links,
public.socials,
public.page_views,
public.click_events
from
  anon,
  authenticated;

grant
select
  on public.profiles,
  public.links,
  public.socials to anon,
  authenticated;

grant
update (
  username,
  display_name,
  bio,
  avatar_url,
  is_public,
  layout,
  background_type,
  background_color,
  gradient_to,
  background_image,
  accent_color,
  text_color,
  font,
  splash_enabled,
  splash_title,
  splash_message
) on public.profiles to authenticated;

grant insert,
update,
delete on public.links,
public.socials to authenticated;

grant
select
  on public.page_views,
  public.click_events to authenticated;

-- This trigger helper is not an exposed RPC.
create function public.handle_new_user () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  insert into public.profiles(id, username, display_name)
  values (
    new.id,
    lower(trim(new.raw_user_meta_data ->> 'username')),
    left(
      coalesce(
        new.raw_user_meta_data ->> 'display_name',
        new.raw_user_meta_data ->> 'username',
        ''
      ),
      80
    )
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user ()
from
  public,
  anon,
  authenticated;

create trigger on_auth_user_created
after insert on auth.users for each row
execute function public.handle_new_user ();

create function public.is_username_available (p_username text) returns boolean language sql stable security definer
set
  search_path = '' as $$
  select coalesce(
    p_username ~ '^[a-z0-9_]{3,24}$'
    and p_username not in (
      'login', 'signup', 'reset-password', 'account', 'admin',
      'api', 'www', 'settings', 'dashboard', 'auth'
    )
    and not exists (
      select 1
      from public.profiles
      where username = p_username
    ),
    false
  );
$$;

create function public.track_view (
  p_profile_id uuid,
  p_device text,
  p_referrer_hostname text default null
) returns bigint language plpgsql security definer
set
  search_path = '' as $$
declare
  total bigint;
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

  -- Atomic update serializes concurrent increments. Owner visits never count.
  update public.profiles
  set view_count = view_count + 1
  where id = p_profile_id
    and is_public
    and id is distinct from auth.uid()
  returning view_count into total;
  if total is not null then
    insert into public.page_views(profile_id, device, referrer_hostname)
    values (p_profile_id, p_device, p_referrer_hostname);
  else
    select view_count into total
    from public.profiles
    where id = p_profile_id
      and (is_public or id = auth.uid());
  end if;
  return total;
end;
$$;

create function public.track_click (
  p_profile_id uuid,
  p_link_id uuid default null,
  p_social_id uuid default null
) returns void language plpgsql security definer
set
  search_path = '' as $$
begin
  if num_nonnulls(p_link_id, p_social_id) <> 1 then
    raise exception 'Supply exactly one click target';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_profile_id
      and is_public
      and id is distinct from auth.uid()
  ) then
    return;
  end if;

  if p_link_id is not null and not exists (
    select 1
    from public.links
    where id = p_link_id and profile_id = p_profile_id
  ) then
    raise exception 'Invalid link';
  end if;

  if p_social_id is not null and not exists (
    select 1
    from public.socials
    where id = p_social_id and profile_id = p_profile_id
  ) then
    raise exception 'Invalid social';
  end if;

  insert into public.click_events(profile_id, link_id, social_id)
  values (p_profile_id, p_link_id, p_social_id);
end;
$$;

revoke all on function public.is_username_available (text),
public.track_view (uuid, text, text),
public.track_click (uuid, uuid, uuid)
from
  public;

grant
execute on function public.is_username_available (text),
public.track_view (uuid, text, text),
public.track_click (uuid, uuid, uuid) to anon,
authenticated;

-- Public assets are deliberately public, even when their profile becomes private.
-- Upload paths must be <authenticated-user-id>/<filename>.
insert into
  storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
  )
values
  (
    'profile-assets',
    'profile-assets',
    true,
    5242880,
    array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ]
  );

create policy assets_read on storage.objects for
select
  to anon,
  authenticated using (bucket_id = 'profile-assets');

create policy assets_insert on storage.objects for insert to authenticated
with
  check (
    bucket_id = 'profile-assets'
    and (storage.foldername (name)) [1] = (
      select
        auth.uid ()
    )::text
  );

create policy assets_update on storage.objects
for update
  to authenticated using (
    bucket_id = 'profile-assets'
    and (storage.foldername (name)) [1] = (
      select
        auth.uid ()
    )::text
  )
with
  check (
    bucket_id = 'profile-assets'
    and (storage.foldername (name)) [1] = (
      select
        auth.uid ()
    )::text
  );

create policy assets_delete on storage.objects for delete to authenticated using (
  bucket_id = 'profile-assets'
  and (storage.foldername (name)) [1] = (
    select
      auth.uid ()
  )::text
);

commit;
