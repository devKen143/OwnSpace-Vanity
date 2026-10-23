import { describe, expect, it } from 'vitest';
import { backgroundFileError, backgroundTheme, gradientColors } from './background';
import { ownedBackgroundPath } from './backgroundUpload';
import type { Profile } from './profile';

describe('background compatibility and safety', () => {
  it('preserves legacy gradients and applies dim defaults and bounds', () => {
    const legacy = {
      background_type: 'gradient',
      background_color: '#112233',
      gradient_to: '#445566',
    } as Profile;
    expect(backgroundTheme(legacy)).toMatchObject({
      type: 'gradient',
      value: ['#112233', '#445566'],
      dim: 30,
    });
    expect(backgroundTheme({ ...legacy, theme: { bg: { dim: 100 } } }).dim).toBe(80);
    expect(backgroundTheme({ ...legacy, theme: { bg: { dim: -4 } } }).dim).toBe(0);
    expect(
      gradientColors({ type: 'animated-gradient', value: ['bad'], preset: 'ocean', dim: 30 }),
    ).toHaveLength(4);
  });
  it('enforces separate image/video caps and MIME types', () => {
    expect(backgroundFileError({ type: 'image/gif', size: 6 * 1024 ** 2 }, false)).toBe('');
    expect(backgroundFileError({ type: 'image/gif', size: 6 * 1024 ** 2 + 1 }, false)).toContain(
      '6 MB',
    );
    expect(backgroundFileError({ type: 'video/webm', size: 10 * 1024 ** 2 }, true)).toBe('');
    expect(backgroundFileError({ type: 'video/mp4', size: 10 * 1024 ** 2 + 1 }, true)).toContain(
      '10 MB',
    );
    expect(backgroundFileError({ type: 'image/svg+xml', size: 10 }, false)).not.toBe('');
    expect(backgroundFileError({ type: 'video/mp4', size: 10 }, false)).not.toBe('');
  });
  it('only cleans up owned assets on the configured project', () => {
    const host = 'https://example.supabase.co';
    const path = '/storage/v1/object/public/media/owner/old.mp4';
    expect(ownedBackgroundPath(host + path, 'owner', host)).toEqual({
      bucket: 'media',
      path: 'owner/old.mp4',
    });
    expect(ownedBackgroundPath(host + path, 'someone-else', host)).toBeNull();
    expect(ownedBackgroundPath('https://other.test' + path, 'owner', host)).toBeNull();
    expect(
      ownedBackgroundPath(
        host + '/storage/v1/object/public/media/owner/%2e%2e%2fvictim/file',
        'owner',
        host,
      ),
    ).toBeNull();
  });
});
