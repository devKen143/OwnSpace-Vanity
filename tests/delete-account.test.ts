import { describe, expect, it, vi } from 'vitest';
import {
  createDeleteHandler,
  type DeletionService,
} from '../supabase/functions/delete-account/handler';

function fixture() {
  const service: DeletionService = {
    authenticate: vi.fn().mockResolvedValue({ id: 'owner-id' }),
    profile: vi.fn().mockResolvedValue({ username: 'alex' }),
    lockProfile: vi.fn().mockResolvedValue(undefined),
    removeMedia: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
  };
  const handler = createDeleteHandler(service);
  const request = (body: unknown, token = 'valid-token') =>
    new Request('https://example.test/delete-account', {
      method: 'POST',
      headers: token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : {},
      body: JSON.stringify(body),
    });
  return { service, handler, request };
}

describe('account deletion boundary', () => {
  it('rejects anonymous callers and invalid tokens before any deletion', async () => {
    const { service, handler, request } = fixture();
    expect((await handler(request({ confirmation: 'DELETE alex' }, ''))).status).toBe(401);
    vi.mocked(service.authenticate).mockResolvedValue(null);
    expect((await handler(request({ confirmation: 'DELETE alex' }))).status).toBe(401);
    expect(service.lockProfile).not.toHaveBeenCalled();
  });
  it('requires exact current username confirmation', async () => {
    const { service, handler, request } = fixture();
    expect((await handler(request({ confirmation: 'DELETE other' }))).status).toBe(400);
    expect(service.removeMedia).not.toHaveBeenCalled();
    expect(service.deleteUser).not.toHaveBeenCalled();
  });
  it('uses the authenticated identity, never a supplied target ID', async () => {
    const { service, handler, request } = fixture();
    const response = await handler(request({ confirmation: 'DELETE alex', userId: 'victim-id' }));
    expect(response.status).toBe(200);
    expect(service.lockProfile).toHaveBeenCalledWith('owner-id', 'alex');
    expect(service.removeMedia).toHaveBeenCalledWith('owner-id');
    expect(service.deleteUser).toHaveBeenCalledWith('owner-id');
    const lockOrder = vi.mocked(service.lockProfile).mock.invocationCallOrder[0];
    const removeOrder = vi.mocked(service.removeMedia).mock.invocationCallOrder[0];
    const deleteOrder = vi.mocked(service.deleteUser).mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(removeOrder);
    expect(removeOrder).toBeLessThan(deleteOrder);
  });
  it('never deletes Auth if Storage cleanup fails, and allows a retry', async () => {
    const { service, handler, request } = fixture();
    vi.mocked(service.removeMedia).mockRejectedValueOnce(new Error('storage unavailable'));
    const failed = await handler(request({ confirmation: 'DELETE alex' }));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ deletionPending: true });
    expect(service.deleteUser).not.toHaveBeenCalled();
    expect((await handler(request({ confirmation: 'DELETE alex' }))).status).toBe(200);
  });
  it('rejects malformed requests and supports CORS preflight without mutation', async () => {
    const { service, handler } = fixture();
    expect((await handler(new Request('https://example.test', { method: 'OPTIONS' }))).status).toBe(
      204,
    );
    expect((await handler(new Request('https://example.test'))).status).toBe(405);
    expect(service.authenticate).not.toHaveBeenCalled();
  });
});
