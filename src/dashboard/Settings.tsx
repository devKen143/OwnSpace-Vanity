import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth';
import { supabase } from '../lib/supabase';
import { usernameError, type Profile } from '../lib/profile';
import { useDashboard } from './Dashboard';

function messageFor(error: unknown) {
  return error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : 'Something went wrong. Please try again.';
}

function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setNotice(await action());
    } catch (error) {
      setError(messageFor(error));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, notice, run };
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status" className="inline-notice">
        {notice}
      </p>
    </>
  );
}

function UsernameSettings() {
  const { profile, setProfile } = useDashboard();
  const [username, setUsername] = useState(profile.username);
  const [availability, setAvailability] = useState<{ value: string; state: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const save = useSave();
  const invalid = usernameError(username);
  const changed = username !== profile.username;
  useEffect(() => {
    if (!changed || invalid) return;
    let active = true;
    setAvailability({ value: username, state: 'Checking availability…' });
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase!.rpc('is_username_available', {
          p_username: username,
        });
        if (active)
          setAvailability({
            value: username,
            state: error
              ? 'Could not check availability.'
              : data
                ? 'Available'
                : 'This username is taken.',
          });
      } catch {
        if (active) setAvailability({ value: username, state: 'Could not check availability.' });
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username, changed, invalid, attempt]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid || availability?.value !== username || availability.state !== 'Available') return;
    void save.run(async () => {
      const { data, error } = await supabase!
        .from('profiles')
        .update({ username })
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error)
        throw new Error(
          error.code === '23505'
            ? 'That username was just taken. Please choose another.'
            : error.message,
        );
      setProfile(data as Profile);
      return 'Username updated. Your public link has changed.';
    });
  }
  return (
    <form className="dashboard-card form-stack" onSubmit={submit}>
      <h2>Username</h2>
      <p className="settings-help">
        Changing this updates your public URL. Your old link will stop working.
      </p>
      <fieldset className="editor-fields" disabled={save.busy || profile.deletion_pending}>
        <label>
          Username
          <input
            aria-label="New username"
            autoComplete="username"
            minLength={3}
            maxLength={20}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            aria-describedby="settings-username-help"
          />
        </label>
        <small id="settings-username-help" aria-live="polite">
          {!changed
            ? `Current link: /${profile.username}`
            : invalid ||
              (availability?.value === username ? availability.state : 'Checking availability…')}
        </small>
        {availability?.state === 'Could not check availability.' && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry availability check
          </button>
        )}
        <button
          className="button"
          disabled={
            !changed ||
            !!invalid ||
            availability?.value !== username ||
            availability?.state !== 'Available'
          }
        >
          {save.busy ? 'Saving…' : 'Save username'}
        </button>
      </fieldset>
      <Feedback {...save} />
    </form>
  );
}

function EmailSettings() {
  const { session } = useSession();
  const { profile } = useDashboard();
  const [email, setEmail] = useState('');
  const save = useSave();
  function submit(event: FormEvent) {
    event.preventDefault();
    void save.run(async () => {
      const { error } = await supabase!.auth.updateUser(
        { email: email.trim() },
        { emailRedirectTo: `${window.location.origin}/account` },
      );
      if (error) throw error;
      setEmail('');
      return 'Email change requested. Check your current and new inboxes for confirmation instructions.';
    });
  }
  return (
    <form className="dashboard-card form-stack" onSubmit={submit}>
      <h2>Email address</h2>
      <p className="settings-help">Current email: {session?.user.email || 'Unavailable'}</p>
      <fieldset disabled={save.busy || profile.deletion_pending} className="editor-fields">
        <label>
          New email
          <input
            aria-label="New email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={
            !email.trim() || email.trim().toLowerCase() === session?.user.email?.toLowerCase()
          }
        >
          {save.busy ? 'Sending…' : 'Change email'}
        </button>
      </fieldset>
      <Feedback {...save} />
    </form>
  );
}

function PasswordSettings() {
  const { profile } = useDashboard();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const save = useSave();
  function submit(event: FormEvent) {
    event.preventDefault();
    void save.run(async () => {
      if (password !== confirmation) throw new Error('The passwords do not match.');
      const { error } = await supabase!.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirmation('');
      return 'Password updated.';
    });
  }
  return (
    <form className="dashboard-card form-stack" onSubmit={submit}>
      <h2>Password</h2>
      <p className="settings-help">
        Use at least 8 characters. If asked to reauthenticate, sign in again before changing your
        password.
      </p>
      <fieldset disabled={save.busy || profile.deletion_pending} className="editor-fields">
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <button className="button">{save.busy ? 'Saving…' : 'Change password'}</button>
      </fieldset>
      <Feedback {...save} />
    </form>
  );
}

function VisibilitySettings() {
  const { profile, setProfile } = useDashboard();
  const save = useSave();
  function change() {
    void save.run(async () => {
      const { data, error } = await supabase!
        .from('profiles')
        .update({ is_public: !profile.is_public })
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;
      setProfile(data as Profile);
      return data.is_public ? 'Your profile is public.' : 'Your profile is private.';
    });
  }
  return (
    <section className="dashboard-card form-stack">
      <h2>Profile visibility</h2>
      <p className="settings-help">
        Private profiles show a 404 page to visitors. Previously shared image URLs remain public.
      </p>
      <button
        className="visibility-switch secondary-button"
        role="switch"
        aria-label="Public profile"
        aria-checked={profile.is_public}
        disabled={save.busy || profile.deletion_pending}
        onClick={change}
      >
        <span aria-hidden="true">{profile.is_public ? '●' : '○'}</span>
        {save.busy ? 'Saving…' : profile.is_public ? 'Public' : 'Private'}
      </button>
      <Feedback {...save} />
    </section>
  );
}

function DeleteAccount() {
  const { profile, setProfile } = useDashboard();
  const [confirmation, setConfirmation] = useState('');
  const navigate = useNavigate();
  const save = useSave();
  const phrase = `DELETE ${profile.username}`;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (confirmation !== phrase) return;
    void save.run(async () => {
      const { data, error } = await supabase!.functions.invoke('delete-account', {
        body: { confirmation },
      });
      if (error) {
        let detail =
          'Could not delete your account. Please try again. Check that the delete-account Edge Function is deployed.';
        if ('context' in error && error.context instanceof Response) {
          try {
            const body = await error.context.json();
            if (typeof body.error === 'string') detail = body.error;
            if (body.deletionPending)
              setProfile((current) =>
                current ? { ...current, deletion_pending: true, is_public: false } : current,
              );
          } catch {
            /* Preserve the useful fallback when a gateway returns non-JSON. */
          }
        }
        throw new Error(detail);
      }
      if (!data?.deleted) throw new Error('Deletion was not confirmed. Please try again.');
      navigate('/login', { replace: true, state: { accountDeleted: true } });
      await supabase!.auth.signOut({ scope: 'local' });
      return 'Account deleted.';
    });
  }
  return (
    <form className="dashboard-card danger-zone form-stack" onSubmit={submit}>
      <h2>Delete account</h2>
      <p className="settings-help">
        Permanently delete your account, profile, links, socials, analytics, and uploaded images.
        This cannot be undone.
      </p>
      {profile.deletion_pending && (
        <p role="status" className="error">
          Deletion has started and your page is hidden. Retry below to finish removing your account.
        </p>
      )}
      <fieldset disabled={save.busy} className="editor-fields">
        <label>
          Type <strong>{phrase}</strong> to confirm
          <input
            aria-label="Delete account confirmation"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <button className="button delete-button" disabled={confirmation !== phrase}>
          {save.busy ? 'Deleting account…' : 'Delete my account permanently'}
        </button>
      </fieldset>
      <Feedback {...save} />
    </form>
  );
}

export default function Settings() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">YOUR SPACE, YOUR CHOICES</span>
        <h1>Settings</h1>
        <p>Manage your profile and account.</p>
      </div>
      <div className="settings-grid">
        <div className="settings-column">
          <UsernameSettings />
          <VisibilitySettings />
          <DeleteAccount />
        </div>
        <div className="settings-column">
          <EmailSettings />
          <PasswordSettings />
        </div>
      </div>
    </>
  );
}
