import { useEffect, useState, type FormEvent } from 'react';
import { fonts, type Profile, type ProfileLink, type Social } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { useDashboard } from './Dashboard';
import { ProfilePreview } from './ProfilePreview';
import { BackgroundEditor } from './BackgroundEditor';
import { backgroundTheme, backgroundFileError } from '../lib/background';
import { capturePoster, uploadBackground, removeOldBackgrounds } from '../lib/backgroundUpload';
import type { BackgroundTheme } from '../lib/profile';

const editableKeys = [
  'theme',
  'display_name',
  'bio',
  'avatar_url',
  'background_type',
  'background_color',
  'gradient_to',
  'background_image',
  'accent_color',
  'text_color',
  'font',
  'layout',
  'splash_enabled',
  'splash_title',
  'splash_message',
] as const;

function editable(profile: Profile) {
  return Object.fromEntries(editableKeys.map((key) => [key, profile[key]]));
}

function useFilePreview(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export function Customize() {
  const { profile, setProfile, setDirty } = useDashboard();
  const [draft, setDraft] = useState(profile);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [background, setBackground] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const posterPreview = useFilePreview(poster);
  const bg = backgroundTheme(draft);
  const avatarPreview = useFilePreview(avatar);
  const backgroundPreview = useFilePreview(background);
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [socials, setSocials] = useState<Social[]>([]);
  const [previewStatus, setPreviewStatus] = useState('Loading preview links…');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty =
    JSON.stringify(editable(draft)) !== JSON.stringify(editable(profile)) ||
    !!avatar ||
    !!background;

  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase!.from('links').select('*').eq('profile_id', profile.id).order('position'),
      supabase!.from('socials').select('*').eq('profile_id', profile.id).order('position'),
    ]).then(([links, socials]) => {
      if (!active) return;
      if (links.error || socials.error)
        setPreviewStatus('Preview links could not load. Refresh to try again.');
      else {
        setLinks(links.data as ProfileLink[]);
        setSocials(socials.data as Social[]);
        setPreviewStatus('');
      }
    });
    return () => {
      active = false;
    };
  }, [profile.id]);

  function change<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
  }

  async function choose(file: File | undefined, kind: 'avatar' | 'background') {
    if (!file) return;
    const video = kind === 'background' && bg.type === 'video';
    const invalid = backgroundFileError(file, video);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    setNotice('');
    if (kind === 'avatar') setAvatar(file);
    else {
      setPreparing(true);
      try {
        const captured = video ? await capturePoster(file) : null;
        setBackground(file);
        setPoster(captured);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Could not prepare this background.');
      } finally {
        setPreparing(false);
      }
    }
  }

  async function upload(file: File, kind: string) {
    const extensions: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const path = `${profile.id}/${kind}-${crypto.randomUUID()}.${extensions[file.type]}`;
    const { error } = await supabase!.storage
      .from('media')
      .upload(path, file, { contentType: file.type });
    if (error)
      throw new Error(
        `Image upload failed: ${error.message}. Check that migration 002_dashboard.sql has been applied.`,
      );
    return supabase!.storage.from('media').getPublicUrl(path).data.publicUrl;
  }

  function changeBackground(next: BackgroundTheme) {
    if (next.type !== bg.type || next.value === '') {
      setBackground(null);
      setPoster(null);
    }
    setDraft((current) => ({
      ...current,
      theme: { ...current.theme, bg: next },
      background_type:
        next.type === 'solid'
          ? 'color'
          : next.type === 'image'
            ? 'image'
            : next.type === 'gradient' || next.type === 'animated-gradient'
              ? 'gradient'
              : 'color',
      background_color:
        next.type === 'solid' && typeof next.value === 'string'
          ? next.value
          : Array.isArray(next.value)
            ? next.value[0]
            : current.background_color,
      gradient_to: Array.isArray(next.value) ? next.value[1] : current.gradient_to,
      background_image: next.type === 'image' && typeof next.value === 'string' ? next.value : null,
    }));
    setNotice('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (draft.bio.length > 160) {
      setError('Shorten your bio to 160 characters before saving.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = { ...draft };
      if (avatar) next.avatar_url = await upload(avatar, 'avatar');
      const previousBg = backgroundTheme(profile);
      const nextBg = { ...backgroundTheme(next) };
      if (background) {
        nextBg.value = await uploadBackground(
          background,
          profile.id,
          'background',
          setUploadProgress,
        );
        nextBg.poster = poster
          ? await uploadBackground(poster, profile.id, 'poster', setUploadProgress)
          : undefined;
      }
      next.theme = { ...next.theme, bg: nextBg };
      next.background_image =
        nextBg.type === 'image' && typeof nextBg.value === 'string' ? nextBg.value : null;
      const { data, error } = await supabase!
        .from('profiles')
        .update(editable(next))
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;
      setProfile(data as Profile);
      setDraft(data as Profile);
      setAvatar(null);
      setBackground(null);
      setPoster(null);
      setNotice('Your changes are live.');
      try {
        await removeOldBackgrounds(
          [
            typeof previousBg.value === 'string' ? previousBg.value : '',
            previousBg.poster || '',
            profile.background_image || '',
          ],
          [
            typeof nextBg.value === 'string' ? nextBg.value : '',
            nextBg.poster || '',
            next.avatar_url || '',
          ],
          profile.id,
        );
      } catch (cleanupError) {
        setError(
          cleanupError instanceof Error
            ? cleanupError.message
            : 'Saved, but old file cleanup failed.',
        );
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not save changes. Your draft is still here; please try again.',
      );
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  }

  const preview = {
    ...draft,
    avatar_url: avatarPreview || draft.avatar_url,
    theme: {
      ...draft.theme,
      bg: {
        ...bg,
        value: backgroundPreview || bg.value,
        poster: posterPreview || (background ? undefined : bg.poster),
      },
    },
  };
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">A LITTLE MORE YOU</span>
        <h1>Customize your space</h1>
        <p>Find a look that feels like home.</p>
      </div>
      <div className="customize-grid">
        <form onSubmit={save} className="customize-form">
          <fieldset disabled={busy || preparing} className="editor-fields">
            <section className="dashboard-card form-stack">
              <h2>The essentials</h2>
              <div className="avatar-editor">
                {preview.avatar_url ? (
                  <img src={preview.avatar_url} alt="Selected avatar" />
                ) : (
                  <div className="avatar-placeholder">{profile.username[0].toUpperCase()}</div>
                )}
                <label>
                  Upload avatar
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => {
                      choose(event.target.files?.[0], 'avatar');
                      event.target.value = '';
                    }}
                  />
                  <small>PNG, JPG, WebP, or GIF · up to 6 MB</small>
                </label>
              </div>
              <label>
                Display name
                <input
                  maxLength={80}
                  value={draft.display_name}
                  onChange={(event) => change('display_name', event.target.value)}
                />
              </label>
              <label>
                Bio
                <textarea
                  aria-label="Bio"
                  rows={3}
                  maxLength={160}
                  value={draft.bio}
                  onChange={(event) => change('bio', event.target.value)}
                />
                <small className={draft.bio.length > 160 ? 'error' : ''}>
                  {draft.bio.length}/160 characters
                </small>
              </label>
            </section>
            <section className="dashboard-card form-stack">
              <h2>Set the mood</h2>
              <BackgroundEditor
                bg={{ ...bg, value: backgroundPreview || bg.value }}
                onChange={changeBackground}
                onFile={(file) => void choose(file, 'background')}
              />
              <div className="field-pair">
                <label>
                  Accent color
                  <input
                    type="color"
                    value={draft.accent_color}
                    onChange={(event) => change('accent_color', event.target.value)}
                  />
                </label>
                <label>
                  Text color
                  <input
                    type="color"
                    value={draft.text_color}
                    onChange={(event) => change('text_color', event.target.value)}
                  />
                </label>
              </div>
              <label>
                Font
                <select
                  aria-label="Font"
                  value={draft.font}
                  onChange={(event) => change('font', event.target.value)}
                >
                  {fonts.map((font) => (
                    <option key={font}>{font}</option>
                  ))}
                </select>
              </label>
              <fieldset className="layout-picker">
                <legend>Layout</legend>
                {(['centered', 'split'] as const).map((layout) => (
                  <label key={layout} className={draft.layout === layout ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="layout"
                      value={layout}
                      checked={draft.layout === layout}
                      onChange={() => change('layout', layout)}
                    />
                    <span>{layout === 'centered' ? '▤ Centered' : '▥ Split'}</span>
                  </label>
                ))}
              </fieldset>
            </section>
            <section className="dashboard-card form-stack">
              <h2>A warm welcome</h2>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={draft.splash_enabled}
                  onChange={(event) => change('splash_enabled', event.target.checked)}
                />
                Show a splash screen
              </label>
              {draft.splash_enabled && (
                <>
                  <label>
                    Splash title
                    <input
                      maxLength={120}
                      value={draft.splash_title}
                      onChange={(event) => change('splash_title', event.target.value)}
                    />
                  </label>
                  <label>
                    Splash text
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={draft.splash_message}
                      onChange={(event) => change('splash_message', event.target.value)}
                    />
                  </label>
                </>
              )}
            </section>
          </fieldset>
          <div aria-live="polite">
            {preparing && <p role="status">Capturing video poster?</p>}
            {uploadProgress !== null && (
              <label>
                Uploading background/poster: {uploadProgress}%
                <progress
                  aria-label="Background upload progress"
                  max={100}
                  value={uploadProgress}
                />
              </label>
            )}
          </div>
          <div className="save-bar">
            <span>
              {busy ? 'Saving your space…' : dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
            <button
              className="button"
              disabled={!dirty || busy || preparing || draft.bio.length > 160}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p role="status" className="inline-notice">
            {notice}
          </p>
        </form>
        <div>
          {previewStatus && <p role="status">{previewStatus}</p>}
          <ProfilePreview profile={preview} links={links} socials={socials} />
        </div>
      </div>
    </>
  );
}
