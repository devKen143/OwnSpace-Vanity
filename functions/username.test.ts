import { describe, expect, it } from 'vitest';
import { escapeHtml, isProfileUsername, onRequestGet } from './[username]';

describe('profile Pages Function helpers', () => {
  it('passes only valid, non-reserved usernames to profile handling', () => {
    expect(isProfileUsername('alex_123')).toBe(true);
    expect(isProfileUsername('admin')).toBe(false);
    expect(isProfileUsername('account')).toBe(false);
    expect(isProfileUsername('ab')).toBe(false);
    expect(isProfileUsername('alex.example')).toBe(false);
    expect(isProfileUsername('Alex')).toBe(false);
  });

  it('escapes HTML-sensitive metadata values', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });

  it('passes reserved, dotted, and invalid paths through untouched', async () => {
    const response = new Response('spa');
    let calls = 0;
    const context = {
      request: new Request('https://own.space/admin'),
      env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon' },
      next: async () => {
        calls += 1;
        return response;
      },
    };
    expect(await onRequestGet(context)).toBe(response);
    expect(calls).toBe(1);
  });
});
