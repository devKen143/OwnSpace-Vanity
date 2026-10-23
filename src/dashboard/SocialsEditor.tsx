import { useEffect, useState, type FormEvent } from 'react';
import { safeUrl, type Social } from '../lib/profile';
import { supabase } from '../lib/supabase';

export const platforms = [
  'Instagram',
  'TikTok',
  'X',
  'YouTube',
  'Twitch',
  'Discord',
  'GitHub',
  'Spotify',
];

function SocialCard({
  platform,
  saved,
  profileId,
  position,
}: {
  platform: string;
  saved?: Social;
  profileId: string;
  position: number;
}) {
  const [value, setValue] = useState(saved?.value || '');
  const [mode, setMode] = useState<'link' | 'copy'>(saved?.mode || 'link');
  const [record, setRecord] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const changed = value !== (record?.value || '') || mode !== (record?.mode || 'link');

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    const trimmed = value.trim();
    if (trimmed && mode === 'link' && !safeUrl(trimmed)) {
      setError('Enter a complete http:// or https:// URL.');
      return;
    }
    setBusy(true);
    try {
      if (!trimmed) {
        if (record) {
          const { error } = await supabase!
            .from('socials')
            .delete()
            .eq('id', record.id)
            .eq('profile_id', profileId);
          if (error) throw error;
        }
        setRecord(undefined);
        setValue('');
        setMode('link');
        setMessage('Social removed.');
      } else {
        const next = {
          id: record?.id || crypto.randomUUID(),
          profile_id: profileId,
          platform,
          value: trimmed,
          mode,
          position,
        };
        const { data, error } = await supabase!.from('socials').upsert(next).select('*').single();
        if (error) throw error;
        setRecord(data as Social);
        setValue(data.value);
        setMessage('Saved.');
      }
    } catch {
      setError('Could not save this social. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="dashboard-card social-editor"
      onSubmit={save}
      aria-label={`${platform} social`}
    >
      <h3>{platform}</h3>
      <fieldset disabled={busy} className="editor-fields form-stack">
        <div className="social-mode" role="group" aria-label={`${platform} action`}>
          {(['link', 'copy'] as const).map((option) => (
            <button
              type="button"
              key={option}
              aria-pressed={mode === option}
              onClick={() => {
                setMode(option);
                setMessage('');
              }}
            >
              {option === 'link' ? '↗ Link' : '⧉ Copy'}
            </button>
          ))}
        </div>
        <label>
          {mode === 'link' ? 'Profile URL' : 'Text to copy'}
          <input
            aria-label={`${platform} value`}
            maxLength={2000}
            value={value}
            placeholder={mode === 'link' ? 'https://…' : 'Your handle or invite code'}
            onChange={(event) => {
              setValue(event.target.value);
              setMessage('');
            }}
          />
        </label>
        <small>Clear the value and save to remove.</small>
        <button className="secondary-button" disabled={!changed || busy}>
          {busy ? 'Saving…' : 'Save social'}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status" className="inline-notice">
        {message}
      </p>
    </form>
  );
}

export function SocialsEditor({ profileId }: { profileId: string }) {
  const [socials, setSocials] = useState<Social[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    supabase!
      .from('socials')
      .select('*')
      .eq('profile_id', profileId)
      .order('position')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError('Social accounts could not load.');
        else setSocials(data as Social[]);
      });
    return () => {
      active = false;
    };
  }, [profileId, attempt]);
  return (
    <section className="socials-section">
      <h2>Your socials</h2>
      <p>Open a profile, or let visitors copy a handle. Save each card when you’re ready.</p>
      {error ? (
        <p role="alert" className="error">
          {error} <button onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </p>
      ) : !socials ? (
        <p role="status">Loading socials…</p>
      ) : (
        <div className="socials-grid">
          {platforms.map((platform, position) => (
            <SocialCard
              key={platform}
              platform={platform}
              position={position}
              profileId={profileId}
              saved={socials.find(
                (social) => social.platform.toLowerCase() === platform.toLowerCase(),
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
