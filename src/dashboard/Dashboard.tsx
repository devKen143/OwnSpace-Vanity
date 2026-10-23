import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSession } from '../auth';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/profile';

type DashboardState = {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile | null>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
};
const DashboardContext = createContext<DashboardState | null>(null);
export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error('Dashboard context is required.');
  return value;
}

export function Dashboard() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    supabase!
      .from('profiles')
      .select('*')
      .eq('id', session!.user.id)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError('Your profile could not be loaded. Please try again.');
        else setProfile(data as Profile);
      });
    return () => {
      active = false;
    };
  }, [session?.user.id, attempt]);

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function canLeave() {
    return !dirty || window.confirm('You have unsaved changes. Leave without saving?');
  }

  async function signOut() {
    if (!canLeave()) return;
    const { error } = await supabase!.auth.signOut();
    if (error) setError(error.message);
    else navigate('/login');
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link
          className="brand"
          to="/"
          onClick={(event) => {
            if (!canLeave()) event.preventDefault();
          }}
        >
          ✳ OwnSpace
        </Link>
        <span className="eyebrow">DASHBOARD</span>
        <nav aria-label="Dashboard">
          {[
            ['', '◈', 'Overview'],
            ['/customize', '✳', 'Customize'],
            ['/links', '↗', 'Links'],
            ['/analytics', '▥', 'Analytics'],
            ['/settings', '⚙', 'Settings'],
          ].map(([path, icon, label]) => (
            <NavLink
              key={path}
              to={`/dashboard${path}`}
              end={path === ''}
              onClick={(event) => {
                if (!canLeave()) event.preventDefault();
              }}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>@{profile?.username || 'yourspace'}</span>
          <button className="quiet-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <span>Your space, a little more you.</span>
          {profile && (
            <a
              className="secondary-button"
              href={`/${profile.username}`}
              target="_blank"
              rel="noreferrer"
            >
              View live ↗
            </a>
          )}
        </header>
        <main className="dashboard-main">
          {error && (
            <div role="alert" className="error">
              {error} <button onClick={() => setAttempt((value) => value + 1)}>Try again</button>
            </div>
          )}
          {profile ? (
            <DashboardContext.Provider value={{ profile, setProfile, setDirty }}>
              <Suspense fallback={<p role="status">Loading page?</p>}>
                <Outlet />
              </Suspense>
            </DashboardContext.Provider>
          ) : (
            !error && <p role="status">Loading your space…</p>
          )}
        </main>
      </div>
    </div>
  );
}

export function Overview() {
  const { profile } = useDashboard();
  const [totals, setTotals] = useState<{ views: number; clicks: number } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const url = `${window.location.origin}/${profile.username}`;
  useEffect(() => {
    let active = true;
    Promise.all([
      supabase!.from('profiles').select('view_count').eq('id', profile.id).single(),
      supabase!
        .from('click_events')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profile.id),
    ]).then(([views, clicks]) => {
      if (!active) return;
      if (views.error || clicks.error)
        setError('Totals could not be loaded. Refresh to try again.');
      else setTotals({ views: views.data.view_count, clicks: clicks.count ?? 0 });
    });
    return () => {
      active = false;
    };
  }, [profile.id]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Profile link copied.');
    } catch {
      setNotice('Could not copy. Select and copy the URL below.');
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">MAKE YOURSELF AT HOME</span>
        <h1>Hello, {profile.display_name || profile.username}.</h1>
        <p>Small updates. A space that keeps growing with you.</p>
      </div>
      <section className="dashboard-card share-card">
        <div>
          <span className="eyebrow">YOUR PUBLIC PAGE</span>
          <p className="profile-url">{url}</p>
          {!profile.is_public && <small>Your profile is currently private.</small>}
        </div>
        <button className="button" onClick={copy}>
          Copy link ⧉
        </button>
      </section>
      <p role="status" className="inline-notice">
        {notice}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="stats-grid">
        <section className="dashboard-card">
          <span>Total views</span>
          <strong>{totals?.views.toLocaleString() ?? '—'}</strong>
          <small>Visits to your public page</small>
        </section>
        <section className="dashboard-card">
          <span>Total clicks</span>
          <strong>{totals?.clicks.toLocaleString() ?? '—'}</strong>
          <small>Link and social interactions</small>
        </section>
      </div>
      <h2 className="section-title">Make it your own</h2>
      <div className="shortcut-grid">
        {[
          ['customize', '✳', 'Find your look', 'Colors, photos, and a little personality.'],
          ['links', '↗', 'Share your world', 'Give your favorite things a home.'],
        ].map(([path, icon, title, text]) => (
          <Link className="dashboard-card shortcut" key={path} to={`/dashboard/${path}`}>
            <span className="shortcut-icon">{icon}</span>
            <h3>{title}</h3>
            <p>{text}</p>
            <span>Let’s do it ↗</span>
          </Link>
        ))}
      </div>
    </>
  );
}
