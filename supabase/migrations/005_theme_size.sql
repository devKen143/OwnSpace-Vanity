alter table public.profiles
  add constraint profiles_theme_size_check
  check (octet_length(theme::text) <= 8192);

alter table public.profiles
  alter column theme set default '{"splash":{"layout":"plain"}}'::jsonb;
