import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
const db = new PGlite();
const owner = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const link = '33333333-3333-3333-3333-333333333333';
beforeAll(async () => {
  // Minimal Supabase schemas; application migration executes unmodified in PostgreSQL.
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    grant usage on schema public,auth,storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  await db.exec(
    readFileSync(new URL('../supabase/migrations/001_init.sql', import.meta.url), 'utf8'),
  );
  await db.exec(
    readFileSync(new URL('../supabase/migrations/002_dashboard.sql', import.meta.url), 'utf8'),
  );
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/003_analytics_settings.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(
    readFileSync(new URL('../supabase/migrations/002_animated_bg.sql', import.meta.url), 'utf8'),
  );
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/004_tracking_dedupe.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(`insert into auth.users values ('${owner}','{"username":"alex"}'),('${other}','{"username":"blair"}');
    insert into public.links(id,profile_id,title,url) values ('${link}','${owner}','Work','https://example.com');`);
}, 30000);
it('pins and reorders only owned links, atomically', async () => {
  const second = '44444444-4444-4444-4444-444444444444';
  await asRole(
    `insert into public.links(id,profile_id,title,url) values ('${second}','${owner}','Second','https://example.com')`,
    owner,
  );
  await asRole(`select public.set_featured_link('${link}')`, owner);
  await asRole(`select public.set_featured_link('${second}')`, owner);
  expect((await asRole(`select id from public.links where is_pinned`, owner))[0].id).toBe(second);
  await expect(asRole(`select public.set_featured_link('${second}')`, other)).rejects.toThrow();
  await expect(asRole(`select public.set_featured_link('${second}')`)).rejects.toThrow();
  await asRole(`select public.reorder_links(array['${second}','${link}']::uuid[])`, owner);
  expect(
    (await asRole(`select id from public.links order by position`, owner)).map((row) => row.id),
  ).toEqual([second, link]);
  await expect(
    asRole(`select public.reorder_links(array['${link}','${link}']::uuid[])`, owner),
  ).rejects.toThrow();
  await expect(
    asRole(`select public.reorder_links(array['${second}','${link}']::uuid[])`, other),
  ).rejects.toThrow();
  await asRole(`delete from public.links where id='${second}'`, owner);
});

it('enforces the Phase 2 bio limit and media folder ownership', async () => {
  await expect(
    asRole(`update public.profiles set bio=repeat('x',161) where id='${owner}'`, owner),
  ).rejects.toThrow();
  await asRole(
    `insert into storage.objects(bucket_id,name) values ('media','${owner}/photo.png')`,
    owner,
  );
  await expect(
    asRole(
      `insert into storage.objects(bucket_id,name) values ('media','${owner}/other.png')`,
      other,
    ),
  ).rejects.toThrow();
  expect(
    (await db.query(`select file_size_limit from storage.buckets where id='media'`)).rows[0]
      .file_size_limit,
  ).toBe(10485760);
  await asRole(`delete from storage.objects where bucket_id='media'`, owner);
});

afterAll(async () => {
  await db.close();
});
async function asRole(sql: string, user = '', role = user ? 'authenticated' : 'anon') {
  await db.exec(
    `begin; set local role ${role}; select set_config('request.jwt.claim.sub','${user}',true);`,
  );
  try {
    const result = await db.query(sql);
    await db.exec('commit');
    return result.rows as Record<string, unknown>[];
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}
it('creates profiles atomically and enforces username constraints', async () => {
  expect((await db.query('select * from public.profiles')).rows).toHaveLength(2);
  await expect(db.exec(`insert into auth.users values (gen_random_uuid(),'{}')`)).rejects.toThrow();
  await expect(
    db.exec(`insert into auth.users values (gen_random_uuid(),'{"username":"login"}')`),
  ).rejects.toThrow();
  await expect(
    db.exec(`insert into auth.users values (gen_random_uuid(),'{"username":"alex"}')`),
  ).rejects.toThrow();
  expect(
    (await asRole("select public.is_username_available('alex') as available"))[0].available,
  ).toBe(false);
});
it('counts public visitor views/clicks and excludes owners', async () => {
  expect(
    (
      await asRole(
        `select public.track_view('${owner}','mobile','example.com','visitor-token-001') as total`,
      )
    )[0].total,
  ).toBe(1);
  expect(
    (
      await asRole(
        `select public.track_view('${owner}','desktop',null,'visitor-token-002') as total`,
        owner,
      )
    )[0].total,
  ).toBe(1);
  await asRole(`select public.track_click('${owner}','${link}',null)`);
  await asRole(`select public.track_click('${owner}','${link}',null)`, owner);
  expect(await asRole('select * from public.page_views', owner)).toHaveLength(1);
  expect(await asRole('select * from public.click_events', owner)).toHaveLength(1);
  expect(await asRole('select * from public.click_events', other)).toHaveLength(0);
  expect(
    (
      await asRole(
        `select public.track_view('${owner}','desktop',null,'visitor-token-001') as total`,
      )
    )[0].total,
  ).toBe(1);
  expect(await asRole('select * from public.page_views', owner)).toHaveLength(1);
  await expect(asRole(`select public.track_click('${other}','${link}',null)`)).rejects.toThrow();
  await expect(
    asRole(`select public.track_view('${owner}','desktop','example.com/private?secret=1')`),
  ).rejects.toThrow();
});
it('prevents unauthorized writes and counter tampering', async () => {
  await asRole(`update public.profiles set bio='tampered' where id='${owner}'`, other);
  expect((await asRole(`select bio from public.profiles where id='${owner}'`))[0].bio).toBe('');
  await expect(
    asRole(`update public.profiles set view_count=900 where id='${owner}'`, owner),
  ).rejects.toThrow();
  await expect(
    asRole(`insert into public.page_views(profile_id,device) values ('${owner}','desktop')`, owner),
  ).rejects.toThrow();
  await expect(
    asRole(
      `insert into public.links(profile_id,title,url) values ('${owner}','Bad','https://example.com')`,
      other,
    ),
  ).rejects.toThrow();
  await asRole(`update public.profiles set bio='Hello' where id='${owner}'`, owner);
  expect((await asRole(`select bio from public.profiles where id='${owner}'`))[0].bio).toBe(
    'Hello',
  );
});
it('hides private content and refuses private tracking', async () => {
  await asRole(`update public.profiles set is_public=false where id='${owner}'`, owner);
  expect(await asRole(`select * from public.profiles where id='${owner}'`)).toHaveLength(0);
  expect(await asRole(`select * from public.links where profile_id='${owner}'`)).toHaveLength(0);
  expect(
    (
      await asRole(
        `select public.track_view('${owner}','desktop',null,'visitor-token-003') as total`,
      )
    )[0].total,
  ).toBeNull();
  await asRole(`select public.track_click('${owner}','${link}',null)`);
  expect(await asRole('select * from public.click_events', owner)).toHaveLength(1);
  expect(await asRole(`select * from public.profiles where id='${owner}'`, owner)).toHaveLength(1);
});
it('restricts storage writes to the owner folder', async () => {
  await asRole(
    `insert into storage.objects(bucket_id,name) values ('profile-assets','${owner}/avatar.png')`,
    owner,
  );
  await expect(
    asRole(
      `insert into storage.objects(bucket_id,name) values ('profile-assets','${owner}/other.png')`,
      other,
    ),
  ).rejects.toThrow();
  await expect(
    asRole(
      `insert into storage.objects(bucket_id,name) values ('profile-assets','${owner}/anon.png')`,
    ),
  ).rejects.toThrow();
  await asRole(`delete from storage.objects where name='${owner}/avatar.png'`, other);
  expect(await asRole('select * from storage.objects')).toHaveLength(1);
});

it('analytics filters ranges, fills empty buckets, computes CTR and isolates owners', async () => {
  const analyst = '55555555-5555-5555-5555-555555555555';
  const target = '66666666-6666-6666-6666-666666666666';
  const social = '77777777-7777-7777-7777-777777777777';
  await db.exec(`insert into auth.users values ('${analyst}','{"username":"analyst"}');
    insert into public.links(id,profile_id,title,url) values ('${target}','${analyst}','Portfolio','https://example.com');
    insert into public.socials(id,profile_id,platform,value,mode) values ('${social}','${analyst}','Discord','handle','copy');
    insert into public.page_views(profile_id,device,created_at) values
      ('${analyst}','mobile',now()-interval '1 hour'),
      ('${analyst}','desktop',now()-interval '25 hours'),
      ('${analyst}','tablet',now()-interval '8 days'),
      ('${analyst}','desktop',now()-interval '31 days');
    insert into public.click_events(profile_id,link_id,social_id) values
      ('${analyst}','${target}',null), ('${analyst}',null,'${social}');`);
  const read = async (range: string) =>
    (await asRole(`select public.get_analytics('${range}') as data`, analyst))[0].data as {
      views: number;
      clicks: number;
      ctr: number;
      series: { views: number }[];
      devices: { device: string; views: number }[];
      top_links: { label: string }[];
      top_socials: { label: string }[];
    };
  const day = await read('24h');
  expect(day.views).toBe(1);
  expect(day.clicks).toBe(2);
  expect(day.ctr).toBe(200);
  expect(day.series.reduce((total, point) => total + point.views, 0)).toBe(1);
  expect(day.series.some((point) => point.views === 0)).toBe(true);
  expect(day.devices).toEqual([{ device: 'mobile', views: 1 }]);
  expect(day.top_links[0].label).toBe('Portfolio');
  expect(day.top_socials[0].label).toBe('Discord');
  expect((await read('7d')).views).toBe(2);
  expect((await read('30d')).views).toBe(3);
  expect((await read('all')).views).toBe(4);
  const empty = (await asRole("select public.get_analytics('all') as data", other))[0].data;
  expect(empty).toMatchObject({ views: 0, clicks: 0, ctr: 0, top_links: [], top_socials: [] });
  await expect(asRole("select public.get_analytics('all')")).rejects.toThrow();
  await expect(asRole("select public.get_analytics('bad')", analyst)).rejects.toThrow();
});

it('username changes enforce the shared rules and uniqueness', async () => {
  await expect(
    asRole(`update public.profiles set username='help' where id='${owner}'`, owner),
  ).rejects.toThrow();
  await expect(
    asRole(`update public.profiles set username=repeat('a',21) where id='${owner}'`, owner),
  ).rejects.toThrow();
  await expect(
    asRole(`update public.profiles set username='blair' where id='${owner}'`, owner),
  ).rejects.toThrow();
  expect(
    (await asRole("select public.is_username_available('help') as available"))[0].available,
  ).toBe(false);
});

it('deletion lock cannot be forged or undone by owners and blocks uploads', async () => {
  await expect(
    asRole(`update public.profiles set deletion_pending=true where id='${other}'`, other),
  ).rejects.toThrow();
  await db.exec(
    `update public.profiles set deletion_pending=true,is_public=false where id='${other}'`,
  );
  await asRole(`update public.profiles set is_public=true where id='${other}'`, other);
  expect(
    (await db.query(`select is_public from public.profiles where id='${other}'`)).rows[0].is_public,
  ).toBe(false);
  await expect(
    asRole(
      `insert into storage.objects(bucket_id,name) values ('media','${other}/new.png')`,
      other,
    ),
  ).rejects.toThrow();
  await expect(
    asRole(
      `insert into storage.objects(bucket_id,name) values ('profile-assets','${other}/new.png')`,
      other,
    ),
  ).rejects.toThrow();
});
