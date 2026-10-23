import { ProfileBackground } from '../components/ProfileBackground';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../auth';
import { supabase } from '../lib/supabase';
import { profileTheme } from '../lib/theme';
import {
  deviceType,
  referrerHost,
  safeUrl,
  type Profile,
  type ProfileLink,
  type Social,
} from '../lib/profile';
export function NotFound({ username }: { username?: string }) {
  const claimUrl = username ? `/signup?username=${encodeURIComponent(username)}` : '/signup';
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">404 · SPACE NOT FOUND</span>
        <h1>A little off the map.</h1>
        <p>This space doesn’t exist or isn’t public.</p>
        <Link className="button" to="/">
          Head home ↗
        </Link>
        <Link className="button button-secondary" to={claimUrl}>
          Claim your username ↗
        </Link>
      </section>
    </main>
  );
}
export function PublicProfile() {
  const { username = '' } = useParams();
  return <ProfileContent key={username} username={username.toLowerCase()} />;
}
function ProfileContent({ username }: { username: string }) {
  const { session, loading: authLoading } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [socials, setSocials] = useState<Social[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [entered, setEntered] = useState(false);
  const [notice, setNotice] = useState('');
  const tracked = useRef(false);
  useEffect(() => {
    if (authLoading || !supabase) return;
    let active = true;
    async function load() {
      try {
        const result = await supabase!
          .from('profiles')
          .select('*')
          .eq('username', username)
          .eq('is_public', true)
          .maybeSingle();
        if (!active) return;
        if (result.error) throw result.error;
        if (!result.data) {
          setState('missing');
          return;
        }
        const p = result.data as Profile;
        const [linkResult, socialResult] = await Promise.all([
          supabase!
            .from('links')
            .select('*')
            .eq('profile_id', p.id)
            .order('is_pinned', { ascending: false })
            .order('position')
            .order('id'),
          supabase!
            .from('socials')
            .select('*')
            .eq('profile_id', p.id)
            .order('position')
            .order('id'),
        ]);
        if (!active) return;
        if (linkResult.error || socialResult.error) throw linkResult.error || socialResult.error;
        setProfile(p);
        setLinks(linkResult.data as ProfileLink[]);
        setSocials(socialResult.data as Social[]);
        setState('ready');
      } catch {
        if (active) setState('error');
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [username, authLoading, session?.user.id]);
  useEffect(() => {
    if (!profile || authLoading || !supabase || tracked.current) return;
    tracked.current = true;
    if (session?.user.id === profile.id) return;
    const storageKey = `ownspace:view:${profile.id}`;
    let visitToken = sessionStorage.getItem(storageKey);
    if (!visitToken) {
      visitToken = crypto.randomUUID();
      sessionStorage.setItem(storageKey, visitToken);
    }
    void supabase
      .rpc('track_view', {
        p_profile_id: profile.id,
        p_device: deviceType(navigator.userAgent),
        p_referrer_hostname: referrerHost(document.referrer),
        p_visit_token: visitToken,
      })
      .then(({ data, error }) => {
        if (!error && typeof data === 'number')
          setProfile((current) => (current ? { ...current, view_count: data } : current));
      });
  }, [profile, authLoading, session?.user.id]);
  useEffect(() => {
    if (profile) document.title = `${profile.display_name || profile.username} · OwnSpace`;
    return () => {
      document.title = 'OwnSpace — A little corner of you';
    };
  }, [profile?.username, profile?.display_name]);
  function track(linkId: string | null, socialId: string | null) {
    if (!profile || !supabase || session?.user.id === profile.id) return;
    void supabase
      .rpc('track_click', { p_profile_id: profile.id, p_link_id: linkId, p_social_id: socialId })
      .then(() => {});
  }
  async function copy(social: Social) {
    try {
      await navigator.clipboard.writeText(social.value);
      setNotice(`${social.platform} copied to clipboard.`);
      track(null, social.id);
    } catch {
      setNotice(`Couldn’t copy automatically. Copy this ${social.platform} value: ${social.value}`);
    }
  }
  if (!supabase)
    return (
      <main className="status">
        <h1>Almost home.</h1>
        <p>Connect Supabase using .env.example to load public profiles.</p>
        <Link to="/">Back home</Link>
      </main>
    );
  if (state === 'missing') return <NotFound username={username} />;
  if (state === 'error')
    return (
      <main className="status">
        <h1>Couldn’t load this space.</h1>
        <p>Please check your connection and try again.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  if (!profile || state === 'loading')
    return (
      <p className="status" role="status">
        Finding this space…
      </p>
    );
  const theme = profileTheme(profile);
  if (profile.splash_enabled && !entered)
    return (
      <main className="profile-page splash" style={theme}>
        <ProfileBackground profile={profile} />
        <section className="splash-card">
          <span className="splash-symbol">✳</span>
          <h1>{profile.splash_title}</h1>
          <p>
            {profile.splash_message ||
              `Step into ${profile.display_name || profile.username}’s space.`}
          </p>
          <button className="profile-link" onClick={() => setEntered(true)}>
            Enter this space ↗
          </button>
          <Link to="/">Back home</Link>
        </section>
      </main>
    );
  return (
    <main className={`profile-page ${profile.layout}`} style={theme}>
      <ProfileBackground profile={profile} />
      <div className="profile-content">
        <header className="profile-identity">
          {safeUrl(profile.avatar_url) ? (
            <img className="profile-avatar" src={safeUrl(profile.avatar_url)} alt="" />
          ) : (
            <div className="profile-avatar initials">
              {(profile.display_name || profile.username).slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="eyebrow">@{profile.username}</span>
          <h1>{profile.display_name || profile.username}</h1>
          <p className="bio">{profile.bio}</p>
          <span className="view-count">{profile.view_count.toLocaleString()} views</span>
        </header>
        <section className="profile-links" aria-label="Links and social accounts">
          {links.length === 0 && socials.length === 0 && (
            <p className="empty-links">A new space. Good things are on their way.</p>
          )}
          {links.map((link) => {
            const url = safeUrl(link.url);
            return url ? (
              <a
                className={`profile-link ${link.is_pinned ? 'pinned' : ''}`}
                key={link.id}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track(link.id, null)}
              >
                <span>
                  {link.is_pinned && <span aria-label="Pinned">✦ </span>}
                  {link.title}
                </span>
                <span aria-hidden="true">↗</span>
              </a>
            ) : null;
          })}
          <div className="social-list">
            {socials.map((social) =>
              social.mode === 'copy' ? (
                <button
                  key={social.id}
                  onClick={() => void copy(social)}
                  aria-label={`Copy ${social.platform}`}
                >
                  {social.platform} ⧉
                </button>
              ) : safeUrl(social.value) ? (
                <a
                  key={social.id}
                  href={safeUrl(social.value)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track(null, social.id)}
                >
                  {social.platform} ↗
                </a>
              ) : null,
            )}
          </div>
          <p className="copy-notice" role="status" aria-live="polite">
            {notice}
          </p>
        </section>
      </div>
      <footer className="profile-footer">
        <Link to="/">✳ Make your OwnSpace</Link>
      </footer>
    </main>
  );
}
