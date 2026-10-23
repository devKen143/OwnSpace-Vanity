const RESERVED_USERNAMES = new Set([
  'admin',
  'login',
  'signup',
  'dashboard',
  'settings',
  'api',
  'www',
  'help',
  'account',
  'assets',
  'favicon.ico',
  'robots.txt',
]);

export interface PagesContext {
  request: Request;
  env: {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
  };
  next: () => Promise<Response>;
}

interface PublicProfile {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface Metadata {
  title: string;
  description: string;
  url: string;
  meta: Record<string, string>;
}

export function isProfileUsername(username: string): boolean {
  return !RESERVED_USERNAMES.has(username) && /^[a-z0-9_]{3,20}$/.test(username);
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

function profileUrl(request: Request, username: string): string {
  return `https://${request.headers.get('host') || new URL(request.url).host}/${username}`;
}

async function getProfile(
  username: string,
  env: PagesContext['env'],
): Promise<PublicProfile | null | undefined> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const url = new URL('/rest/v1/profiles', env.SUPABASE_URL);
    url.searchParams.set('select', 'username,display_name,bio,avatar_url');
    url.searchParams.set('username', `eq.${username}`);
    url.searchParams.set('is_public', 'eq.true');
    const response = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const profiles = (await response.json()) as PublicProfile[];
    return profiles[0] ?? null;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function addMetadata(response: Response, metadata: Metadata, noindex: boolean) {
  const transformed = new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(metadata.title);
      },
    })
    .on('head', {
      element(element) {
        for (const [name, content] of Object.entries(metadata.meta)) {
          const attribute = name.startsWith('twitter:') ? 'name' : 'property';
          element.append(
            `<meta ${attribute}="${escapeHtml(name)}" content="${escapeHtml(content)}">`,
            { html: true },
          );
        }
        element.append(
          `<meta name="description" content="${escapeHtml(metadata.description)}">` +
            `<link rel="canonical" href="${escapeHtml(metadata.url)}">` +
            (noindex ? '<meta name="robots" content="noindex">' : ''),
          { html: true },
        );
      },
    })
    .transform(response);
  transformed.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
  return transformed;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const username = new URL(context.request.url).pathname.split('/').filter(Boolean)[0] ?? '';
  if (!isProfileUsername(username)) return context.next();

  const profile = await getProfile(username, context.env);
  if (profile === undefined) return context.next();

  const response = await context.next();
  if (!profile) {
    return addMetadata(
      response,
      {
        title: 'Space not found · OwnSpace',
        description: 'This OwnSpace does not exist or is not public.',
        url: profileUrl(context.request, username),
        meta: {
          'og:title': 'Space not found · OwnSpace',
          'og:description': 'This OwnSpace does not exist or is not public.',
          'og:image': `${new URL(context.request.url).origin}/og-default.png`,
          'og:url': profileUrl(context.request, username),
          'og:type': 'profile',
          'twitter:card': 'summary',
        },
      },
      true,
    );
  }

  const title = `${profile.display_name || profile.username} · OwnSpace`;
  const description = profile.bio || `Discover ${profile.display_name || profile.username}'s OwnSpace.`;
  return addMetadata(
    response,
    {
      title,
      description,
      url: profileUrl(context.request, username),
      meta: {
        'og:title': title,
        'og:description': description,
        'og:image': profile.avatar_url || `${new URL(context.request.url).origin}/og-default.png`,
        'og:url': profileUrl(context.request, username),
        'og:type': 'profile',
        'twitter:card': 'summary',
      },
    },
    false,
  );
}
