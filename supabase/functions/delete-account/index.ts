import { createClient } from 'npm:@supabase/supabase-js@2';
import { createDeleteHandler } from './handler.ts';

// This key stays inside the Edge Function runtime, never in Vite or the browser.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function removeFolder(bucket: string, folder: string) {
  // Read the first page repeatedly because successful removals shrink the list.
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 });
    if (error) throw error;
    if (!data?.length) return;
    const files: string[] = [];
    for (const object of data) {
      const path = `${folder}/${object.name}`;
      if (object.id) files.push(path);
      else await removeFolder(bucket, path);
    }
    if (files.length) {
      const { error } = await admin.storage.from(bucket).remove(files);
      if (error) throw error;
    }
  }
}

Deno.serve(
  createDeleteHandler({
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : data.user;
    },
    async profile(id) {
      const { data, error } = await admin
        .from('profiles')
        .select('username')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async lockProfile(id, username) {
      const { error } = await admin
        .from('profiles')
        .update({ deletion_pending: true, is_public: false })
        .eq('id', id)
        .eq('username', username)
        .select('id')
        .single();
      if (error) throw error;
    },
    async removeMedia(id) {
      for (const bucket of ['media', 'profile-assets']) await removeFolder(bucket, id);
    },
    async deleteUser(id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    },
  }),
);
