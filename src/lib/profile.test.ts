import { describe, expect, it } from 'vitest';
import { deviceType, referrerHost, safeUrl, usernameError } from './profile';
describe('public profile input boundaries', () => {
  it('rejects route collisions and invalid usernames', () => {
    for (const value of ['login', 'admin', 'ab', 'UPPER', 'a/b', 'a'.repeat(25)])
      expect(usernameError(value)).not.toBe('');
    expect(usernameError('alex_123')).toBe('');
  });
  it('allows web destinations and rejects executable URLs', () => {
    expect(safeUrl('https://example.com/work')).toBe('https://example.com/work');
    for (const value of ['javascript:alert(1)', 'data:text/html,hi', '//example.com', '', null])
      expect(safeUrl(value)).toBeUndefined();
  });
  it('never passes paths, credentials, queries, or fragments as referrers', () => {
    expect(referrerHost('https://user:secret@example.com/private?token=123#secret')).toBe(
      'example.com',
    );
    expect(referrerHost('')).toBeNull();
  });
  it('classifies mobile, tablet and desktop devices', () => {
    expect(deviceType('Mozilla/5.0 (iPhone) Mobile')).toBe('mobile');
    expect(deviceType('Mozilla/5.0 (Linux; Android 13) Mobile')).toBe('mobile');
    expect(deviceType('Mozilla/5.0 (Linux; Android 13)')).toBe('tablet');
    expect(deviceType('Mozilla/5.0 (iPad)')).toBe('tablet');
    expect(deviceType('Mozilla/5.0 (Windows NT 10.0)')).toBe('desktop');
  });
});
