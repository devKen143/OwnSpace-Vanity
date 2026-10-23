import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usernameError } from '../lib/profile';
import { useSession } from '../auth';

export function AuthPage({ mode }: { mode: 'login' | 'signup' | 'reset' }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading } = useSession();
  const [username, setUsername] = useState(params.get('username')?.toLowerCase() ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [availability, setAvailability] = useState<{
    value: string;
    state: 'checking' | 'available' | 'taken' | 'error';
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const invalidUsername = usernameError(username);
  const updatingPassword = mode === 'reset' && !!session;
  useEffect(() => {
    if (mode === 'login' && params.get('confirmed') === '1') {
      setMessage('Email confirmed, log in to continue.');
    }
  }, [mode, params]);
  useEffect(() => {
    if (mode !== 'signup' || invalidUsername || !supabase) return;
    let active = true;
    setAvailability({ value: username, state: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase!.rpc('is_username_available', {
          p_username: username,
        });
        if (active)
          setAvailability({
            value: username,
            state: error ? 'error' : data ? 'available' : 'taken',
          });
      } catch {
        if (active) setAvailability({ value: username, state: 'error' });
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username, mode, invalidUsername]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'signup') {
        if (
          invalidUsername ||
          availability?.value !== username ||
          availability.state !== 'available'
        )
          throw new Error('Choose an available username.');
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username }, emailRedirectTo: `${window.location.origin}/login?confirmed=1` },
        });
        if (error) throw error;
        try {
          window.localStorage.setItem('ownspace:returning', '1');
        } catch {
          // Storage is optional.
        }
        if (data.session) navigate('/account');
        else setMessage('Check your email to confirm your account, then sign in.');
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        try {
          window.localStorage.setItem('ownspace:returning', '1');
        } catch {
          // Storage is optional.
        }
        navigate('/account');
      } else if (updatingPassword) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword('');
        setMessage('Your password has been updated. You can return to your account.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage('If an account exists for that email, you’ll receive a password reset link.');
      }
    } catch (err) {
      setError(
        mode === 'login' || mode === 'signup'
          ? 'We couldn’t complete that request. Check your details and try again.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === 'signup'
      ? 'Make yourself at home.'
      : mode === 'login'
        ? 'Welcome back.'
        : updatingPassword
          ? 'Choose a new password.'
          : 'A fresh start.';
  return (
    <main className="auth-shell">
      <Link className="brand" to="/">
        ✳ OwnSpace
      </Link>
      <div className="auth-card">
        <span className="eyebrow">YOUR LITTLE CORNER OF THE INTERNET</span>
        <h1>{title}</h1>
        <p className="muted">
          {mode === 'signup'
            ? 'One page for all the things that make you, you.'
            : mode === 'login'
              ? 'Your space is right where you left it.'
              : 'Let’s get you back into your space.'}
        </p>
        {!supabase && (
          <p className="error" role="alert">
            Connect Supabase using the environment variables in .env.example to enable
            authentication.
          </p>
        )}
        <form onSubmit={submit} className="form-stack">
          {mode === 'login' && location.state?.accountDeleted && (
            <p role="status" className="success">
              Your account has been deleted.
            </p>
          )}
          {mode === 'signup' && (
            <label>
              Username
              <input
                aria-label="Username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={20}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                aria-describedby="username-help"
              />
              <small id="username-help" aria-live="polite">
                {invalidUsername ||
                  (availability?.value !== username
                    ? 'Checking availability…'
                    : availability.state === 'available'
                      ? '✓ This space can be yours.'
                      : availability.state === 'taken'
                        ? 'That username is already taken.'
                        : availability.state === 'error'
                          ? 'Unable to check availability. Try editing the username again.'
                          : 'Checking availability…')}
              </small>
            </label>
          )}
          {!updatingPassword && (
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          )}
          {(mode !== 'reset' || updatingPassword) && (
            <label>
              {updatingPassword ? 'New password' : 'Password'}
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'login' ? 1 : 8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode !== 'login' && <small>Use at least 8 characters.</small>}
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="success">
              {message}
            </p>
          )}
          <button
            className="button"
            disabled={
              !supabase ||
              busy ||
              loading ||
              (mode === 'signup' &&
                (!!invalidUsername ||
                  availability?.value !== username ||
                  availability?.state !== 'available'))
            }
          >
            {busy
              ? 'One moment…'
              : mode === 'signup'
                ? 'Create my space ↗'
                : mode === 'login'
                  ? 'Sign in ↗'
                  : updatingPassword
                    ? 'Save new password'
                    : 'Send reset link'}
          </button>
        </form>
        <div className="auth-links">
          {mode === 'login' ? (
            <>
              <Link to="/reset-password">Forgot password?</Link>
              <Link to="/signup">New here? Claim your space</Link>
            </>
          ) : (
            <Link to="/login">
              {mode === 'signup' ? 'Already have an account? Log in' : 'Back to sign in'}
            </Link>
          )}
          {session && <Link to="/account">Your account</Link>}
        </div>
      </div>
    </main>
  );
}
