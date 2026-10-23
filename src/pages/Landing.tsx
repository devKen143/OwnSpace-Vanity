import { useEffect, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../auth';

function readReturningFlag() {
  try {
    return window.localStorage.getItem('ownspace:returning') === '1';
  } catch {
    return false;
  }
}

export function shouldRedirectToDashboard(loading: boolean, session: unknown) {
  return !loading && !!session;
}

export function Landing() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    document.title = 'OwnSpace — All your worlds. One little space.';
    const description = 'OwnSpace is a little corner for all your worlds.';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    return () => {
      document.title = 'OwnSpace — A little corner of you';
    };
  }, []);

  useEffect(() => {
    if (shouldRedirectToDashboard(loading, session)) navigate('/dashboard', { replace: true });
  }, [loading, navigate, session]);

  function enter() {
    if (exiting || loading || session) return;
    const destination = readReturningFlag() ? '/login' : '/signup';
    if (reducedMotion) {
      navigate(destination);
      return;
    }
    setExiting(true);
    window.setTimeout(() => navigate(destination), 250);
  }

  function handleClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (!target.closest('a, button')) enter();
  }

  if (loading || session) {
    return <main className="entry-splash" aria-busy="true" />;
  }

  return (
    <main className={`entry-splash ${exiting ? 'entry-splash-exiting' : ''}`} onClick={handleClick}>
      <div className="entry-content">
        <span className="entry-mark" aria-hidden="true">
          ✳
        </span>
        <h1>OwnSpace</h1>
        <p>All your worlds. One little space.</p>
        <span className="entry-hint">Click anywhere to enter</span>
        <button className="button" onClick={enter}>
          Enter
        </button>
      </div>
      <Link className="entry-about" to="/about">
        What is OwnSpace?
      </Link>
    </main>
  );
}
