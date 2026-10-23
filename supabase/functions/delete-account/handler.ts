export interface DeletionService {
  authenticate(token: string): Promise<{ id: string } | null>;
  profile(id: string): Promise<{ username: string } | null>;
  lockProfile(id: string, username: string): Promise<void>;
  removeMedia(id: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function createDeleteHandler(service: DeletionService) {
  return async (request: Request): Promise<Response> => {
    function respond(status: number, body: unknown) {
      return new Response(JSON.stringify(body), {
        status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer '))
      return respond(401, { error: 'Sign in before deleting your account.' });
    let locked = false;
    try {
      // Always validate the token with Auth. Never accept a user ID from the request.
      const user = await service.authenticate(authorization.slice(7));
      if (!user) return respond(401, { error: 'Your session is invalid. Please sign in again.' });
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return respond(400, { error: 'Invalid request.' });
      }
      const profile = await service.profile(user.id);
      if (!profile)
        return respond(409, {
          error: 'Your profile could not be found. Please contact the project administrator.',
        });
      if (
        !body ||
        typeof body !== 'object' ||
        !('confirmation' in body) ||
        body.confirmation !== `DELETE ${profile.username}`
      ) {
        return respond(400, {
          error: 'The confirmation must exactly match DELETE followed by your current username.',
        });
      }
      await service.lockProfile(user.id, profile.username);
      locked = true;
      // Remove actual objects through Storage, not metadata through SQL.
      await service.removeMedia(user.id);
      await service.deleteUser(user.id);
      return respond(200, { deleted: true });
    } catch {
      return respond(503, {
        error: locked
          ? 'Your page is hidden, but deletion could not finish. Some images may already be removed. Please retry deletion.'
          : 'Account deletion could not start. Please try again.',
        deletionPending: locked,
      });
    }
  };
}
