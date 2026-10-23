import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { safeUrl, type ProfileLink } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { useDashboard } from './Dashboard';
import { SocialsEditor } from './SocialsEditor';

function LinkRow({
  link,
  disabled,
  edit,
  remove,
  pin,
}: {
  link: ProfileLink;
  disabled: boolean;
  edit: () => void;
  remove: () => void;
  pin: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: link.id,
    disabled,
  });
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="dashboard-card link-editor-row"
    >
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Reorder ${link.title}`}
      >
        ⠿
      </button>
      <div className="link-summary">
        <h3>
          {link.title} {link.is_pinned && <span className="featured-label">Featured</span>}
        </h3>
        <p>{link.url}</p>
      </div>
      <div className="link-actions">
        <button
          className="quiet-button"
          disabled={disabled}
          onClick={pin}
          aria-label={`${link.is_pinned ? 'Unpin' : 'Pin'} ${link.title}`}
          aria-pressed={link.is_pinned}
        >
          ✦
        </button>
        <button className="quiet-button" disabled={disabled} onClick={edit}>
          Edit
        </button>
        <button className="quiet-button danger" disabled={disabled} onClick={remove}>
          Delete
        </button>
      </div>
    </article>
  );
}

export function LinksEditor() {
  const { profile } = useDashboard();
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<ProfileLink | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<ProfileLink | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    const { data, error } = await supabase!
      .from('links')
      .select('*')
      .eq('profile_id', profile.id)
      .order('position')
      .order('id');
    if (error) throw error;
    setLinks(data as ProfileLink[]);
  }, [profile.id]);
  useEffect(() => {
    let active = true;
    supabase!
      .from('links')
      .select('*')
      .eq('profile_id', profile.id)
      .order('position')
      .order('id')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError('Links could not load. Refresh to try again.');
        else setLinks(data as ProfileLink[]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profile.id]);

  function edit(link: ProfileLink | 'new') {
    setEditing(link);
    setTitle(link === 'new' ? '' : link.title);
    setUrl(link === 'new' ? '' : link.url);
    setFormError('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !safeUrl(url.trim())) {
      setFormError('Add a label and a complete http:// or https:// URL.');
      return;
    }
    setBusy(true);
    setFormError('');
    setError('');
    setNotice('');
    try {
      const values = { title: title.trim(), url: url.trim() };
      const result =
        editing === 'new'
          ? await supabase!
              .from('links')
              .insert({
                ...values,
                profile_id: profile.id,
                position: Math.max(-1, ...links.map((link) => link.position)) + 1,
              })
              .select('*')
              .single()
          : await supabase!
              .from('links')
              .update(values)
              .eq('id', editing!.id)
              .eq('profile_id', profile.id)
              .select('*')
              .single();
      if (result.error) throw result.error;
      await load();
      setEditing(null);
      setNotice('Link saved.');
    } catch {
      setFormError('Could not save your link. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function pin(link: ProfileLink) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error } = await supabase!.rpc('set_featured_link', {
        p_link_id: link.is_pinned ? null : link.id,
      });
      if (error) throw error;
      await load();
      setNotice(
        link.is_pinned
          ? 'Featured link removed.'
          : 'Featured link updated. It will appear first on your public page.',
      );
    } catch {
      setError(
        'Could not update the featured link. Check migration 002_dashboard.sql is applied, then try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function reorder({ active, over }: DragEndEvent) {
    if (busy || !over || active.id === over.id) return;
    const previous = links;
    const next = arrayMove(
      links,
      links.findIndex((link) => link.id === active.id),
      links.findIndex((link) => link.id === over.id),
    );
    setLinks(next);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error } = await supabase!.rpc('reorder_links', {
        p_link_ids: next.map((link) => link.id),
      });
      if (error) throw error;
      setLinks(next.map((link, position) => ({ ...link, position })));
      setNotice('Link order saved.');
    } catch {
      setLinks(previous);
      setError(
        'Could not save the order. Check migration 002_dashboard.sql is applied, then refresh and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error } = await supabase!
        .from('links')
        .delete()
        .eq('id', deleting.id)
        .eq('profile_id', profile.id);
      if (error) throw error;
      setLinks((current) => current.filter((link) => link.id !== deleting.id));
      setDeleting(null);
      setNotice('Link deleted.');
    } catch {
      setError('Could not delete the link. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <span className="eyebrow">ALL YOUR WORLDS</span>
          <h1>Links & socials</h1>
          <p>Bring your favorite corners of the internet together.</p>
        </div>
        <button
          className="button"
          onClick={() => edit('new')}
          disabled={loading || busy || !!editing}
        >
          + Add link
        </button>
      </div>
      {editing && (
        <form className="dashboard-card form-stack link-form" onSubmit={save}>
          <h2>{editing === 'new' ? 'Add a link' : 'Edit link'}</h2>
          <fieldset disabled={busy} className="editor-fields form-stack">
            <label>
              Link label
              <input
                autoFocus
                maxLength={120}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              URL
              <input
                placeholder="https://example.com"
                required
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <div className="editor-actions">
              <button className="button">{busy ? 'Saving…' : 'Save link'}</button>
              <button type="button" className="secondary-button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </fieldset>
          {formError && (
            <p role="alert" className="error">
              {formError}
            </p>
          )}
        </form>
      )}
      {deleting && (
        <section
          className="dashboard-card delete-prompt"
          role="alertdialog"
          aria-label="Delete link confirmation"
        >
          <h2>Delete “{deleting.title}”?</h2>
          <p>This also removes its recorded clicks.</p>
          <button className="button" disabled={busy} onClick={remove}>
            Delete permanently
          </button>
          <button className="secondary-button" disabled={busy} onClick={() => setDeleting(null)}>
            Keep link
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status" className="inline-notice">
        {busy ? 'Saving…' : notice}
      </p>
      {loading ? (
        <p role="status">Loading links…</p>
      ) : !links.length ? (
        <section className="dashboard-card empty-editor">
          <span>↗</span>
          <h2>Your first link belongs here.</h2>
          <p>Add your work, your shop, or something you love.</p>
        </section>
      ) : (
        <>
          <p className="editor-hint">
            Drag the handle to reorder. Keyboard: Space to pick up, arrow keys to move, Space to
            drop. One featured link always appears first.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
            <SortableContext
              items={links.map((link) => link.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="link-list">
                {links.map((link) => (
                  <LinkRow
                    key={link.id}
                    link={link}
                    disabled={busy || !!editing || !!deleting}
                    edit={() => edit(link)}
                    remove={() => setDeleting(link)}
                    pin={() => void pin(link)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
      <SocialsEditor profileId={profile.id} />
    </>
  );
}
