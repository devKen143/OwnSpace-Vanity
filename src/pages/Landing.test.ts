import { describe, expect, it } from 'vitest';
import { shouldRedirectToDashboard } from './Landing';

describe('entry splash routing', () => {
  it('redirects an established session before showing the splash', () => {
    expect(shouldRedirectToDashboard(false, { user: { id: 'user-1' } })).toBe(true);
    expect(shouldRedirectToDashboard(true, { user: { id: 'user-1' } })).toBe(false);
    expect(shouldRedirectToDashboard(false, null)).toBe(false);
  });
});
