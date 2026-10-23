import { expect, test } from '@playwright/test';
const profile = {
  id: '11111111-1111-1111-1111-111111111111',
  username: 'alex',
  display_name: 'Alex Morgan',
  bio: 'A space for good things.',
  avatar_url: null,
  is_public: true,
  layout: 'split',
  background_type: 'gradient',
  background_color: '#f6f3ec',
  gradient_to: '#d5e9de',
  background_image: null,
  accent_color: '#305b43',
  text_color: '#203629',
  font: 'Lora',
  splash_enabled: true,
  splash_title: 'Welcome, friend.',
  splash_message: 'Take a look around.',
  view_count: 10,
};
test('entry splash routes returning visitors and keeps the about page reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('ownspace:returning', '1'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'OwnSpace' })).toBeVisible();
  await expect(page.getByText('All your worlds. One little space.')).toBeVisible();
  await page.getByRole('button', { name: 'Enter' }).press('Space');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/about');
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'What is OwnSpace?' })).toHaveCount(0);
});
test('new visitors enter signup and reduced motion skips the exit delay', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('ownspace:returning');
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: true, addListener: () => {}, removeListener: () => {} }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/signup$/);
});
test('landing page remains within the viewport at mobile width', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'OwnSpace' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
});
test('splash, themed profile, pinned links and tracking survive strict effects', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  let views = 0;
  let clicks = 0;
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/profiles')) return route.fulfill({ json: profile });
    if (path.endsWith('/links'))
      return route.fulfill({
        json: [
          {
            id: 'link1',
            profile_id: profile.id,
            title: 'Pinned work',
            url: 'https://example.com',
            is_pinned: true,
            position: 5,
          },
          {
            id: 'link2',
            profile_id: profile.id,
            title: 'Other work',
            url: 'https://example.com',
            is_pinned: false,
            position: 0,
          },
        ],
      });
    if (path.endsWith('/socials'))
      return route.fulfill({
        json: [
          {
            id: 'social1',
            profile_id: profile.id,
            platform: 'Email',
            value: 'alex@example.com',
            mode: 'copy',
            position: 0,
          },
        ],
      });
    if (path.endsWith('/track_view')) {
      views++;
      expect(route.request().postDataJSON()).toMatchObject({
        p_device: 'desktop',
        p_referrer_hostname: null,
      });
      return route.fulfill({ json: 11 });
    }
    if (path.endsWith('/track_click')) {
      clicks++;
      return route.fulfill({ json: null });
    }
    return route.abort();
  });
  await page.goto('/alex');
  await expect(page.getByRole('heading', { name: 'Welcome, friend.' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter this space' }).click();
  await expect(page.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible();
  await expect(page.getByText('11 views')).toBeVisible();
  await expect(page.locator('.profile-link').first()).toContainText('Pinned work');
  await expect(page.locator('main')).toHaveClass(/split/);
  expect(await page.locator('main').evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
    'Lora',
  );
  await page.getByRole('button', { name: 'Copy Email' }).click();
  await expect(page.getByRole('status')).toHaveText('Email copied to clipboard.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('alex@example.com');
  await expect.poll(() => clicks).toBe(1);
  expect(views).toBe(1);
  await page.screenshot({ path: 'test-results/profile-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('unknown or private profiles show 404', async ({ page }) => {
  await page.route('**/rest/v1/profiles*', (route) => route.fulfill({ json: null }));
  await page.goto('/missing');
  await expect(page.getByText('404 · SPACE NOT FOUND')).toBeVisible();
});
test('plain splash renders only its title and enters from the keyboard', async ({ page }) => {
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/profiles'))
      return route.fulfill({
        json: {
          ...profile,
          theme: {
            splash: {
              layout: 'plain',
              title: 'Click into my page',
              clickAnywhere: true,
            },
          },
        },
      });
    if (path.endsWith('/links') || path.endsWith('/socials'))
      return route.fulfill({ json: [] });
    if (path.endsWith('/track_view')) return route.fulfill({ json: 11 });
    return route.fulfill({ json: null });
  });
  await page.goto('/alex');
  const title = page.getByRole('button', { name: 'Enter page' });
  await expect(title).toHaveText('Click into my page');
  await expect(page.getByRole('button', { name: 'Enter this space ↗' })).toHaveCount(0);
  await expect(page.getByText('Back home')).toHaveCount(0);
  await title.focus();
  await title.press('Enter');
  await expect(page.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible();
});
