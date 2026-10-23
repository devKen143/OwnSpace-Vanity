# OwnSpace

Link-in-bio platform. Public profiles at /:username.

## Stack

Vite + React + TypeScript, react-router, Tailwind, @supabase/supabase-js, @dnd-kit, recharts. Dark UI. Deploy: Cloudflare Pages (public/_redirects: `/* /index.html 200`). Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.

## Schema (supabase/migrations/001_init.sql, RLS on all tables)

- profiles(id = auth.users.id, username unique, display_name, bio max 160, avatar_url, layout 'centered'|'split', theme jsonb, splash_enabled, splash_text, is_public, created_at)
- links(id, profile_id, label, url, position, is_pinned)
- socials(id, profile_id, platform, value, mode 'link'|'copy', position)
- view_events(id, profile_id, created_at, device_class, referrer_host)
- click_events(id, profile_id, link_id null, social_id null, created_at)
- Storage bucket "media": public read, users write only to {uid}/..., 6MB, png/jpg/webp/gif
- RLS: owners full CRUD on own rows; anon SELECT on public profiles/links/socials; no direct anon inserts on event tables
- Security-definer RPCs: track_view(p_username, p_device, p_referrer_host), track_click(p_username, p_link_id, p_social_id), get_analytics(p_range)
- Privacy: never store IPs; referrer hostname only
- Usernames: 3-20 chars [a-z0-9_]; reserved: admin, login, signup, dashboard, settings, api, www, help

## Routes

/ (landing + username claim), /login, /signup, /reset-password, /dashboard/* (protected: overview, customize, links, analytics, settings), /:username (public, last route)

## Rules

Strict TypeScript. One supabase client module. Small reusable components. Loading, error, and empty states everywhere. Mobile-responsive. No unrequested features (no multi-page profiles, badges, audio, cursor, effects, import, chat, payments). Don't ask questions; make reasonable assumptions. Keep commentary minimal. Run `npm run build` once at the end of a task and fix errors.
