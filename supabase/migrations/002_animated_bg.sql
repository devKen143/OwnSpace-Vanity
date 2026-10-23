-- Apply once to the existing project after 002_dashboard.sql (and 003, if installed).
-- The filename is retained as requested; use SQL Editor for this incremental migration.
begin;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'
    ]
where id = 'media';

alter table public.profiles add column if not exists theme jsonb not null default '{}'::jsonb;
grant update (theme) on public.profiles to authenticated;

commit;
