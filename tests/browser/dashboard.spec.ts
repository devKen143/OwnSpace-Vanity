import type { Profile } from '../../src/lib/profile';
import { expect, test, type Page } from '@playwright/test';

const owner = '11111111-1111-1111-1111-111111111111';
test('public video backgrounds honor save-data and fall back on errors', async ({ page }) => {
  const state = await setup(page);
  state.profile.theme = {
    bg: {
      type: 'video',
      value: 'https://test.supabase.co/storage/v1/object/public/media/clip.webm',
      poster: 'https://test.supabase.co/storage/v1/object/public/media/poster.jpg',
      dim: 55,
    },
  };
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: Object.assign(new EventTarget(), { saveData: true }),
    }),
  );
  await page.goto('/alex');
  await expect(page.locator('.profile-background img')).toHaveAttribute('src', /poster.jpg$/);
  await expect(page.locator('.profile-background video')).toHaveCount(0);
  await expect(page.locator('.background-dim')).toHaveCSS('opacity', '0.55');
  await expect(page.locator('.profile-background')).toHaveCSS('position', 'fixed');
  await page.evaluate(() => {
    const network = (navigator as Navigator & { connection: EventTarget & { saveData: boolean } })
      .connection;
    network.saveData = false;
    network.dispatchEvent(new Event('change'));
  });
  // The mock serves an invalid video; playback must fall back to its poster.
  await expect(page.locator('.profile-background img')).toHaveAttribute('src', /poster.jpg$/);
  await expect(page.locator('.profile-background video')).toHaveCount(0);
});
test('animated backgrounds preview, capture a video poster, upload, and clean up after save', async ({
  page,
}) => {
  const state = await setup(page);
  const old = `https://test.supabase.co/storage/v1/object/public/media/${owner}/old.mp4`;
  const oldPoster = `https://test.supabase.co/storage/v1/object/public/media/${owner}/old.jpg`;
  state.profile.theme = { bg: { type: 'video', value: old, poster: oldPoster, dim: 30 } };
  await page.goto('/dashboard/customize');
  await page.getByLabel('Background', { exact: true }).selectOption('animated-gradient');
  await page.getByLabel('Gradient preset', { exact: true }).selectOption('sunset');
  await expect(page.locator('.profile-background')).toHaveClass(/animated-background/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.profile-background')).not.toHaveClass(/animated-background/);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByLabel('Background', { exact: true }).selectOption('video');
  const recorded = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d')!;
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    const blob = await new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      recorder.start();
      context.fillStyle = '#226655';
      context.fillRect(0, 0, 160, 90);
      setTimeout(() => recorder.stop(), 250);
    });
    stream.getTracks().forEach((track) => track.stop());
    return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
  });
  await page.getByLabel('Upload background video', { exact: true }).setInputFiles({
    name: 'background.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from(recorded, 'base64'),
  });
  await expect(page.getByText('Capturing video poster…')).not.toBeVisible();
  await expect(page.locator('.profile-background video')).toHaveAttribute('poster', /^blob:/);
  expect(
    await page
      .locator('.profile-background video')
      .evaluate((video) => (video as HTMLVideoElement).muted),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.profile-background video')).toHaveCount(0);
  await expect(page.locator('.profile-background img')).toHaveAttribute('src', /^blob:/);
  expect(state.removed).toHaveLength(0);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Your changes are live.')).toBeVisible();
  expect(state.profile.theme?.bg?.type).toBe('video');
  expect(state.profile.theme?.bg?.poster).toContain('/media/');
  await expect.poll(() => state.removed.length).toBe(2);
  expect(state.removed).toEqual([`${owner}/old.mp4`, `${owner}/old.jpg`]);
  await page.getByRole('button', { name: 'Remove background', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => state.removed.length).toBe(4);
});
test('analytics ranges, empty/error states and chart render without console errors', async ({
  page,
}) => {
  const state = await setup(page);
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().includes('width(-1)'))
      problems.push(message.text());
  });
  await page.goto('/dashboard/analytics');
  await expect(page.locator('.analytics-kpis')).toContainText('25%');
  await expect(page.getByRole('meter', { name: 'mobile share' })).toHaveAttribute(
    'aria-valuenow',
    '75',
  );
  await expect(page.locator('.ranking-grid')).toContainText('Discord');
  await expect(page.locator('.recharts-line')).toBeVisible();
  await page.screenshot({ path: 'test-results/analytics-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '24h', exact: true }).click();
  await expect(
    page.getByText('No views in this range yet. Share your profile link to get started.'),
  ).toBeVisible();
  await page.getByRole('button', { name: '30d', exact: true }).click();
  await expect(page.locator('.analytics-kpis')).toContainText('25%');
  await page.getByRole('button', { name: 'All time', exact: true }).click();
  await expect(page.locator('.analytics-kpis')).toContainText('25%');
  expect(state.analyticsRanges).toEqual(expect.arrayContaining(['7d', '24h', '30d', 'all']));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/analytics-mobile.png', fullPage: true });
  expect(problems).toEqual([]);
  state.failAnalytics = true;
  await page.getByRole('button', { name: '7d', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Analytics could not load');
  state.failAnalytics = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.analytics-kpis')).toContainText('25%');
});

test('settings validate usernames, persist visibility, and submit email/password changes', async ({
  page,
}) => {
  const state = await setup(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dashboard/settings');
  await page.getByRole('textbox', { name: 'New username' }).fill('help');
  await expect(page.getByText('This username is reserved.')).toBeVisible();
  await page.getByRole('textbox', { name: 'New username' }).fill('taken');
  await expect(page.getByText('This username is taken.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save username' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'New username' }).fill('alex_new');
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save username' }).click();
  await expect(page.getByText('Username updated. Your public link has changed.')).toBeVisible();
  expect(state.profile.username).toBe('alex_new');
  await expect(page.getByRole('link', { name: 'View live' })).toHaveAttribute('href', '/alex_new');
  await page.getByRole('switch', { name: 'Public profile' }).click();
  await expect(page.getByRole('switch', { name: 'Public profile' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  expect(state.profile.is_public).toBe(false);
  await page.getByLabel('New email', { exact: true }).fill('new@example.com');
  await page.getByRole('button', { name: 'Change email' }).click();
  await expect(page.getByText(/Email change requested/)).toBeVisible();
  expect(state.authChanges[0]).toMatchObject({ email: 'new@example.com' });
  await page.getByLabel('New password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm new password', { exact: true }).fill('different123');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('The passwords do not match.')).toBeVisible();
  await page.getByLabel('Confirm new password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password updated.')).toBeVisible();
  expect(state.authChanges[1]).toMatchObject({ password: 'password123' });
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/settings-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('deletion needs exact confirmation, keeps retry available on failure, and signs out on success', async ({
  page,
}) => {
  const state = await setup(page);
  state.failDeletion = true;
  await page.goto('/dashboard/settings');
  const remove = page.getByRole('button', { name: 'Delete my account permanently' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Delete account confirmation').fill('DELETE wrong');
  await expect(remove).toBeDisabled();
  expect(state.deletionRequests).toHaveLength(0);
  await page.getByLabel('Delete account confirmation').fill('DELETE alex');
  await remove.click();
  await expect(page.getByRole('alert')).toContainText('Deletion could not finish');
  await expect(page.getByText(/Deletion has started and your page is hidden/)).toBeVisible();
  await expect(page.getByRole('switch')).toBeDisabled();
  state.failDeletion = false;
  await remove.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Your account has been deleted.')).toBeVisible();
  expect(state.deletionRequests).toEqual([
    { confirmation: 'DELETE alex' },
    { confirmation: 'DELETE alex' },
  ]);
});
const initialProfile = {
  id: owner,
  username: 'alex',
  theme: {} as Profile['theme'],
  display_name: 'Alex Morgan',
  bio: 'A space for good things.',
  avatar_url: null,
  is_public: true,
  layout: 'centered',
  background_type: 'color',
  background_color: '#f6f3ec',
  gradient_to: '#d5e9de',
  background_image: null,
  accent_color: '#305b43',
  text_color: '#203629',
  font: 'DM Sans',
  splash_enabled: false,
  splash_title: 'Hello there',
  splash_message: '',
  view_count: 12,
};

async function setup(page: Page) {
  const state = {
    profile: { ...initialProfile },
    links: [
      {
        id: 'link1',
        profile_id: owner,
        title: 'My work',
        url: 'https://example.com',
        is_pinned: false,
        position: 0,
      },
      {
        id: 'link2',
        profile_id: owner,
        title: 'My shop',
        url: 'https://example.com/shop',
        is_pinned: false,
        position: 1,
      },
    ],
    socials: [] as Record<string, unknown>[],
    uploads: [] as string[],
    removed: [] as string[],
    failSave: false,
    failAnalytics: false,
    failDeletion: false,
    analyticsRanges: [] as string[],
    authChanges: [] as Record<string, unknown>[],
    deletionRequests: [] as Record<string, unknown>[],
  };
  await page.addInitScript(
    ({ owner }) => {
      const user = {
        id: owner,
        email: 'alex@example.com',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
      };
      const token = [
        btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
        btoa(JSON.stringify({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 })),
        'signature',
      ].join('.');
      localStorage.setItem(
        'sb-test-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'test-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
    },
    { owner },
  );
  await page.route('https://test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body =
      ['POST', 'PATCH', 'PUT'].includes(method) && !path.includes('/storage/')
        ? request.postDataJSON()
        : null;
    if (path === '/auth/v1/user') {
      if (method === 'PUT') state.authChanges.push(body);
      return route.fulfill({
        json: { id: owner, aud: 'authenticated', email: 'alex@example.com' },
      });
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (path.endsWith('/rpc/is_username_available'))
      return route.fulfill({ json: body.p_username !== 'taken' });
    if (path.endsWith('/functions/v1/delete-account')) {
      state.deletionRequests.push(body);
      return state.failDeletion
        ? route.fulfill({
            status: 503,
            json: { error: 'Deletion could not finish. Please retry.', deletionPending: true },
          })
        : route.fulfill({ json: { deleted: true } });
    }
    if (path.endsWith('/rpc/get_analytics')) {
      state.analyticsRanges.push(body.p_range);
      if (state.failAnalytics)
        return route.fulfill({ status: 500, json: { message: 'Unavailable' } });
      const empty = body.p_range === '24h';
      return route.fulfill({
        json: {
          range: body.p_range,
          bucket: 'day',
          views: empty ? 0 : 12,
          clicks: empty ? 0 : 3,
          ctr: empty ? 0 : 25,
          series: [
            { at: '2026-10-22T00:00:00Z', views: empty ? 0 : 5 },
            { at: '2026-10-23T00:00:00Z', views: empty ? 0 : 7 },
          ],
          devices: empty
            ? []
            : [
                { device: 'mobile', views: 9 },
                { device: 'desktop', views: 3 },
              ],
          top_links: empty ? [] : [{ id: 'link1', label: 'My work', clicks: 2 }],
          top_socials: empty ? [] : [{ id: 'social1', label: 'Discord', clicks: 1 }],
        },
      });
    }
    if (path.endsWith('/profiles')) {
      if (method === 'PATCH') {
        if (state.failSave) return route.fulfill({ status: 500, json: { message: 'Save failed' } });
        state.profile = { ...state.profile, ...body };
      }
      return route.fulfill({ json: state.profile });
    }
    if (path.endsWith('/click_events'))
      return route.fulfill({
        status: 200,
        headers: { 'content-range': '0-4/5', 'access-control-expose-headers': 'content-range' },
        body: '',
      });
    if (path.endsWith('/links')) {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      if (method === 'POST') {
        const link = { id: 'link' + (state.links.length + 1), is_pinned: false, ...body };
        state.links.push(link);
        return route.fulfill({ json: link });
      }
      if (method === 'PATCH') {
        const index = state.links.findIndex((link) => link.id === id);
        state.links[index] = { ...state.links[index], ...body };
        return route.fulfill({ json: state.links[index] });
      }
      if (method === 'DELETE') {
        state.links = state.links.filter((link) => link.id !== id);
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: [...state.links].sort((a, b) => a.position - b.position) });
    }
    if (path.endsWith('/socials')) {
      if (method === 'POST') {
        state.socials = [body];
        return route.fulfill({ json: body });
      }
      if (method === 'DELETE') {
        state.socials = [];
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: state.socials });
    }
    if (path.endsWith('/rpc/reorder_links')) {
      state.links = body.p_link_ids.map((id: string, position: number) => ({
        ...state.links.find((link) => link.id === id),
        position,
      }));
      return route.fulfill({ json: null });
    }
    if (path.endsWith('/rpc/set_featured_link')) {
      state.links = state.links.map((link) => ({ ...link, is_pinned: link.id === body.p_link_id }));
      return route.fulfill({ json: null });
    }
    if (path === '/storage/v1/object/media' && method === 'DELETE') {
      state.removed.push(...request.postDataJSON().prefixes);
      return route.fulfill({ json: [] });
    }
    if (path.includes('/storage/v1/object/media/') && method === 'POST') {
      state.uploads.push(path);
      return route.fulfill({ json: { Key: path } });
    }
    if (path.includes('/storage/'))
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    return route.abort();
  });
  return state;
}

test('dashboard shows totals, copies URL, and opens analytics', async ({ page, context }) => {
  await setup(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Hello, Alex Morgan.' })).toBeVisible();
  await expect(page.locator('.stats-grid')).toContainText('12');
  await expect(page.locator('.stats-grid')).toContainText('5');
  await page.getByRole('button', { name: 'Copy link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'http://127.0.0.1:5174/alex',
  );
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('customize keeps edits in preview until saved, uploads and persists changes', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/dashboard/customize');
  await page.getByLabel('Display name').fill('Alex Creates');
  await page.getByLabel('Bio', { exact: true }).fill('New creative home');
  await expect(page.getByText('17/160 characters')).toBeVisible();
  await expect(page.locator('.preview-pane h1')).toHaveText('Alex Creates');
  expect(state.profile.display_name).toBe('Alex Morgan');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByLabel('Background', { exact: true }).selectOption('gradient');
  await page.getByLabel('Font', { exact: true }).selectOption('Lora');
  await page.getByRole('radio', { name: /Split/ }).check();
  await page.getByLabel('Show a splash screen').check();
  await page.getByLabel('Splash text').fill('Come on in');
  await page.getByRole('button', { name: 'Preview splash' }).click();
  await expect(page.locator('.preview-pane')).toContainText('Come on in');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
    'base64',
  );
  await page
    .getByLabel('Upload avatar', { exact: false })
    .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Your changes are live.')).toBeVisible();
  expect(state.uploads[0]).toContain(`/media/${owner}/avatar-`);
  expect(state.profile).toMatchObject({
    display_name: 'Alex Creates',
    bio: 'New creative home',
    background_type: 'gradient',
    font: 'Lora',
    layout: 'split',
    splash_enabled: true,
  });
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('Alex Creates');
  state.failSave = true;
  await page.getByLabel('Display name').fill('Unsaved name');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveValue('Unsaved name');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/customize-mobile.png', fullPage: true });
});

test('links validate, persist CRUD, reorder by keyboard, pin one, and save copy socials', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/dashboard/links');
  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Link label').fill('New link');
  await page.getByLabel('URL', { exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save link', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('complete http:// or https:// URL');
  await page.getByLabel('URL', { exact: true }).fill('https://example.com/new');
  await page.getByRole('button', { name: 'Save link', exact: true }).click();
  await expect(page.locator('.link-editor-row')).toHaveCount(3);
  const first = page.getByRole('button', { name: 'Reorder My work' });
  await first.focus();
  await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByText('Draggable item link1 was moved over droppable area link2'),
  ).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('Link order saved.')).toBeVisible();
  expect(state.links[0].title).toBe('My shop');
  await page.getByRole('button', { name: 'Pin My work', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unpin My work', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pin My shop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unpin My shop', exact: true })).toBeVisible();
  expect(state.links.filter((link) => link.is_pinned)).toHaveLength(1);
  const row = page.locator('.link-editor-row').filter({ hasText: 'New link' });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Link label').fill('Renamed');
  await page.getByRole('button', { name: 'Save link', exact: true }).click();
  await page
    .locator('.link-editor-row')
    .filter({ hasText: 'Renamed' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.locator('.link-editor-row')).toHaveCount(2);
  const discord = page.getByRole('form', { name: 'Discord social' });
  await discord.getByRole('button', { name: 'Copy', exact: false }).click();
  await page.getByLabel('Discord value').fill('alex#1234');
  await discord.getByRole('button', { name: 'Save social' }).click();
  await expect(discord.getByRole('status')).toHaveText('Saved.');
  expect(state.socials[0]).toMatchObject({ platform: 'Discord', mode: 'copy', value: 'alex#1234' });
  await page.reload();
  await expect(page.locator('.link-editor-row').first()).toContainText('My shop');
  await expect(page.getByLabel('Discord value')).toHaveValue('alex#1234');
});
