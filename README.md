# OwnSpace · Phase 1

A Vite + React + TypeScript + Tailwind app with Supabase authentication and public personal pages. `AGENTS.md` was empty when this phase was implemented, so the requested Phase 1 checklist defines the scope. The three public RPCs are `is_username_available`, `track_view`, and `track_click`.

## Local setup

1. Install Node.js 22.12+ (Node 24 works) and run `npm install`.
2. Create a new Supabase project. In its SQL Editor, run the entire contents of `supabase/migrations/001_init.sql` once. Alternatively, apply it with your Supabase CLI migration workflow. Then run `supabase/migrations/002_dashboard.sql` and `supabase/migrations/003_analytics_settings.sql` once, in order. Run the initial migration before registering users: the auth trigger creates each profile atomically on signup using the supplied username. Existing auth users need a manually inserted profile with an available username.
3. Copy `.env.example` to `.env`. Set `VITE_SUPABASE_URL` to your project URL and `VITE_SUPABASE_ANON_KEY` to your anon or publishable key. Never put a service-role or secret key in Vite environment variables.
4. In Supabase Authentication → URL Configuration, set the Site URL and add redirect URLs:
   - `http://localhost:5173/account`
   - `http://localhost:5173/reset-password`
   - The equivalent `/account` and `/reset-password` URLs on your production domain.
5. Enable the Email provider. Keep email confirmation enabled for production and configure SMTP for reliable delivery. Use a password minimum of at least 8 characters to match the form. The default confirmation and recovery email templates work with these redirect URLs.
6. Run `npm run dev`. On Windows with PowerShell script execution restricted, use `npm.cmd install` and `npm.cmd run dev`.

The landing page works without credentials. Auth and public profile routes show a configuration message until Supabase is configured. Restart Vite after changing `.env`.

## Routes and behavior

- `/`: landing page; claiming a username carries it into signup.
- `/signup`: validated, debounced availability checking with stale response protection. The database unique constraint resolves signup races. The signup metadata triggers creation of a profile even when email confirmation means there is no client session yet.
- `/login`: email/password sign-in.
- `/reset-password`: sends recovery email when signed out; updates the password after the recovery link establishes a session. Signed-in users can also change their password here.
- `/account`: protected compatibility redirect to `/dashboard`; existing email confirmation redirects still work.
- `/dashboard`: overview with public URL, copy action, totals, and editing shortcuts.
- `/dashboard/customize`: draft-based profile/theme editor with image uploads and live preview.
- `/dashboard/links`: link CRUD, drag ordering, featured link, and eight social editors.
- `/dashboard/analytics`: owner-only range-based analytics, charts, devices, and top targets.
- `/dashboard/settings`: username, email, password, visibility, and typed-confirmation account deletion.
- `/:username`: public profile with splash gate, centered/split layouts, themes, links, socials, clipboard actions, and view count. Unknown and private profiles use the same 404 screen, including for an owner visiting a private profile. Because Cloudflare serves a static SPA, this is a client-rendered 404, not an HTTP 404 response.

Themes support color, two-color gradients, and image backgrounds; accent and text colors; and DM Sans, Inter, Lora, Space Grotesk, or Manrope from Google Fonts. Links open in a new tab. Copy-mode social values can be handles, email addresses, or other text. Clipboard access requires HTTPS or localhost; a failed copy displays the value for manual copying. The splash gate is a presentation feature, not access control.

## Populate a profile for testing

Sign up first, then use the Supabase Table Editor to edit the corresponding `profiles` row. Set `display_name`, `bio`, `layout`, theme fields, and splash fields. Add `links` and `socials` rows using that profile’s `id` as `profile_id`.

Links have `title`, `url` (HTTP/HTTPS), `position`, and `is_pinned`. At most one link per profile can be pinned; it appears before links ordered by position. Socials have `platform` (display label), `value`, `mode` (`link` or `copy`), and `position`.

The `profile-assets` bucket accepts JPEG, PNG, WebP, and GIF up to 5 MB. Authenticated users can upload/update/delete only under `<user-id>/<filename>`. Use the public asset URL in `avatar_url` or `background_image`. This bucket is public: hiding a profile does not revoke previously shared asset URLs.

## Database and tracking

`profiles`, `links`, `socials`, `page_views`, and `click_events` all have RLS. Public visitors can read only public profiles and their links/socials. Owners can edit their content and read their analytics. Owners cannot directly change `view_count`; visitors cannot insert analytics rows directly. Apply `004_tracking_dedupe.sql` after the other migrations.

- `is_username_available(p_username text)` checks syntax, reserved routes, and uniqueness, including private usernames.
- `track_view(p_profile_id uuid, p_device text, p_referrer_hostname text, p_visit_token text)` atomically increments and returns the view count, records device + hostname only, and deduplicates repeated views for the same profile and browser session.
- `track_click(p_profile_id uuid, p_link_id uuid default null, p_social_id uuid default null)` records exactly one target belonging to that public profile.

Both tracking RPCs reject/ignore invalid or private targets and exclude authenticated owner activity. The client calls `track_view` once per mounted profile page after session resolution, including when a splash is shown, and does not retry failed tracking calls. Repeated views for the same profile in one browser session are deduplicated. Referrer paths, queries, and credentials are never sent. This is a visit counter, not unique visitors or bot-resistant analytics. Anonymous RPCs can still be invoked outside the UI, so this is not a complete anti-bot system.

## Verify

Keep source files readable with `npm run format` (HTML, React, TypeScript, CSS, JSON, and Markdown). Use `npm run format:check` to check formatting without changing files. Run `npm run format:sql` for the migration; SQL function bodies are formatted manually.

```sh
npm test
npm run build
```

`npm test` runs input-boundary tests and the unmodified migration against embedded PostgreSQL (PGlite) with minimal Supabase auth/storage schema stubs. These exercise RLS, grants, profile creation, RPCs, and storage ownership; they do not replace verification against hosted Supabase.

For browser tests, run `npx playwright install chromium`, then `npm run test:browser`. You can set `PLAYWRIGHT_CHANNEL=msedge` to use an installed Microsoft Edge. These tests start a separate Vite server with mocked Supabase responses, covering mobile username claiming, validation, protected routing, splash/profile rendering, clipboard behavior, tracking, and 404s. They do not send real emails or create real accounts.

Manual checks against your configured Supabase project:

1. Claim a username, sign up, confirm email, sign in, and open `/account`. Verify exactly one profile row exists. Try invalid, reserved, and already-taken usernames.
2. Sign out and visit `/account`; verify redirection to login. Request a password reset, open the email link, and save a new password.
3. Populate a profile and visit it in an incognito window. Test both layouts, all background modes, fonts, splash entry, pinned link order, and clipboard socials on mobile and desktop.
4. Confirm one view event per page load, no owner view/click events, and link/social click events with the correct targets. Confirm the referrer contains only a hostname.
5. Set `is_public=false` and verify its page shows 404. Verify another authenticated user cannot change the profile or its links/socials, read its analytics, or upload into its storage folder.

## Cloudflare Pages

Connect the repository in Cloudflare Pages, choose the Vite framework preset, and configure:

- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `24` (set `NODE_VERSION` if needed)
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the Vite build, plus `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Cloudflare Pages Functions. The latter must be the anon key, never a service-role key.

Pages uses its built-in SPA fallback when there is no top-level `404.html`. No catch-all `_redirects` rule is needed. Add the deployed origin and authentication redirect URLs to Supabase. For previews, explicitly allow their callback URLs if you intend to test auth there. Environment variables are embedded at build time; redeploy after changing them.

To test the deployed-style metadata function locally, build first and run `npx wrangler pages dev dist`. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the local Pages environment.

### Cloudflare Workers (Workers Builds)

If the project was created as a Worker, use build command `npm run build` and deploy command `npx wrangler deploy`. The checked-in `wrangler.jsonc` serves `dist` with `assets.not_found_handling: "single-page-application"` so direct visits to profile and dashboard routes load the app. Set the same Vite environment variables in the build environment. Do not restore `/* /index.html 200`: Workers rejects that rule as an infinite redirect loop.

References: [Workers SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [Pages default routing](https://developers.cloudflare.com/pages/configuration/serving-pages/).

Reference: [Supabase user profiles and triggers](https://supabase.com/docs/guides/auth/managing-user-data), [password recovery](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [Tailwind’s Vite integration](https://tailwindcss.com/docs/installation/using-vite).

## Phase 2 dashboard setup

For the existing Supabase project, run only `supabase/migrations/002_dashboard.sql` in SQL Editor. Do not rerun `001_init.sql`. Then open `/dashboard` after signing in.

The migration adds the public `media` bucket (6 MB, PNG/JPG/WebP/GIF), owner-folder write policies, the 160-character bio constraint, and two authenticated editor RPCs: `set_featured_link` and `reorder_links`. The RPCs enforce ownership and apply each pin or reorder transaction atomically. Upload, pin, and reorder actions require this migration. Legacy asset URLs in `profile-assets` continue to work. Existing bios longer than 160 characters are not truncated; shorten them in Customize before updating their profile.

Customize stages selected images locally and uploads them only when Save changes is pressed. Its live preview uses the same theme helper as the public profile and never records views or clicks. Navigation through the sidebar and refreshing/closing the page warn about unsaved customization. Browser back navigation is not blocked. Links save individually, reorder saves on drop, and each social card has its own save button. Clear and save a social value to remove it. Deleting a link also deletes its click history under the existing Phase 1 foreign-key behavior.

The AGENTS.md content was supplied after Phase 1 was already deployed. Phase 2 deliberately keeps the deployed column/API names: individual theme columns instead of `theme` JSON, `splash_title`/`splash_message` instead of `splash_text`, `links.title` instead of `label`, and the original view RPC/event schema. No destructive renames were included in Phase 2. The dashboard displays label and splash-text fields backed by those existing columns. Phase 3 synchronizes signup and username changes with the 3?20 character rules, including the reserved name `help`; existing longer usernames are preserved until changed.

Browser tests use mocked authenticated Supabase sessions and verify overview totals/copy, customization preview and persistence, upload paths, save failures, link CRUD/validation, keyboard drag ordering, featured links, and copy-mode socials. Database tests apply both migrations against PGlite and verify cross-owner RPC rejection, bio limits, and media ownership.

References: [dnd-kit sortable](https://dndkit.com/legacy/presets/sortable/overview/).

## Phase 3 setup

1. In Supabase SQL Editor, run `supabase/migrations/003_analytics_settings.sql` once after migrations 001 and 002. Do not rerun prior migrations.
2. Deploy the `delete-account` Edge Function from the project folder:

   ```powershell
   npx.cmd supabase login
   npx.cmd supabase functions deploy delete-account --project-ref YOUR_PROJECT_REF
   ```

   Replace `YOUR_PROJECT_REF` with the project reference from its Supabase URL. This deploys both files in `supabase/functions/delete-account/`. The checked-in `supabase/config.toml` sets gateway `verify_jwt = false`; authentication is still mandatory and is explicitly checked using `auth.getUser(bearerToken)` inside the function. The handler rejects invalid or missing user tokens before any write. Never remove that check.

3. The function uses Supabase's built-in server environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is never passed to the frontend. No new Vite variables are needed.
4. Keep `/account` in the Auth redirect allowlist for both localhost and production. Email changes use that existing callback. With Secure Email Change enabled, follow the messages sent to both current and new email addresses. Password changes honor your project's password and recent-authentication requirements; sign in again if a stale session is rejected.
5. Open `/dashboard/analytics` and `/dashboard/settings` while signed in. Test real deletion only with a disposable account and disposable uploads.

### Analytics contract

`get_analytics(p_range)` accepts `24h`, `7d`, `30d`, or `all`. It derives the owner from `auth.uid()`, accepts no target profile ID, and returns counts, CTR, a zero-filled view series, device counts, and the ten most-clicked links/socials. Anonymous calls and invalid ranges are rejected. Ranges are rolling to the time of the query; bucket boundaries are UTC. 24h uses hourly buckets, 7d/30d use daily buckets, and all-time uses monthly buckets when the oldest view is more than 366 days old. Partial boundary buckets are expected.

CTR means all link/social clicks divided by page views, multiplied by 100. It returns zero when there are no views and can exceed 100% because a visitor may click multiple items. These are event counts, not unique visitor counts. Existing link/social deletion cascades remove their historical click events, so historical totals can decrease after deleting those targets. No IP addresses or new visitor identifiers are collected.

### Account deletion implementation

Deletion uses the `delete-account` **Edge Function**, not a browser-accessible security-definer delete RPC. It verifies the signed-in user with Supabase Auth and requires the exact string `DELETE <current-username>` on the server as well as in the form. Caller-supplied user IDs are ignored; the only target is the validated user's ID.

The function marks the profile `deletion_pending` and private, then recursively removes that user's folder from both `media` and legacy `profile-assets` through the Storage API in batches of at most 100 files. It then permanently deletes the Auth user with the server-only admin API. Existing foreign keys cascade the profile, links, socials, and events. The browser signs out locally on confirmed success.

The new restrictive policies block owners from republishing a pending-deletion profile or uploading new media, including through a stale token after the profile is removed. The `deletion_pending` column cannot be updated by browser roles. Storage and Auth are not one database transaction: a storage or Auth failure returns a retryable error, keeps the account private, and does not falsely report success. Some images may already be deleted. Retry with the same typed confirmation to finish; the handler safely lists remaining files again. For a very large account, an Edge Function timeout can require another attempt. Never delete Storage metadata with raw SQL; that would leave the underlying files behind.

Migration 003 also replaces the Phase 2 bio CHECK with a validation trigger for inserted/changed bios. This preserves legacy long bios without breaking view-counter increments or unrelated settings updates; edited bios must still be at most 160 characters. New or changed usernames use the same 3?20 lowercase letter/number/underscore validation in signup, settings, availability checks, and the database. Existing usernames are not renamed automatically.

### Phase 3 verification

`npm test` covers analytics ranges, CTR, zero-filled series, ownership, username validation, deletion locks, and the Edge handler's confirmation/authentication/failure paths. `npm run test:browser` uses mocked Supabase responses to test analytics tabs/chart/empty/error states, username edits, visibility, email/password submission, deletion retry/success, and mobile overflow. Happy-path analytics tests also assert no browser console errors or chart sizing warnings. Tests do not delete any live account or send email.

Type-check the Edge runtime separately with `npx.cmd deno check supabase/functions/delete-account/index.ts`. The normal Vite build checks the browser code, not the Deno entrypoint. Authenticated live-email delivery and deployment of the migration/function require your Supabase project setup.

References: [deploy Edge Functions](https://supabase.com/docs/guides/functions/deploy), [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets), [delete Storage objects through the API](https://supabase.com/docs/guides/storage/management/delete-objects), [Auth user updates](https://supabase.com/docs/reference/javascript/auth-updateuser).

## Animated backgrounds

Run `supabase/migrations/002_animated_bg.sql` once in the SQL Editor of the existing project, after `002_dashboard.sql` (and after 003 if already installed). The requested filename reuses the 002 prefix: do not feed these duplicate version prefixes to CLI migration discovery; apply this incremental file in SQL Editor. It adds the optional `profiles.theme` JSON field and expands the `media` bucket to 10 MB with MP4/WebM support. Existing image policies and ownership checks are unchanged. Images are capped at 6 MB client-side; videos at 10 MB.

`theme.bg` contains `type` (solid, gradient, animated-gradient, image, or video), `value`, optional `poster`, `dim` (0?80, default 30), and optional `preset` (aurora, sunset, ocean, mono). Values are hex colors for solid backgrounds, arrays of hex color stops for gradients, and URLs for image/video backgrounds. Missing values fall back to legacy background columns; unrelated theme fields are preserved.

Customize stages background changes until Save. Video selection captures a JPEG poster locally with canvas before upload. Upload progress is displayed for the media and poster; both go under `media/<user-id>/`. The old background/poster is removed through Storage only after the profile save succeeds, and only if its URL belongs to this project and owner. External URLs and assets still used by the avatar are not deleted. Cleanup errors are reported separately from a successful save.

Public pages and live preview share the same background layer. Videos are always muted, looping, inline, and metadata-preloaded. Reduced-motion or data-saving visitors receive the poster without loading video; animated gradients freeze at their first frame. GIF/WebP images animate natively for other visitors; when a still image poster is unavailable under reduced motion/data saving, they fall back to the solid color. Video load/playback failures also use the poster or solid fallback.
