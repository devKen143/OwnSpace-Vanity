import { supabase } from './supabase';

export async function capturePoster(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Could not read this video. Try a different MP4 or WebM file.')),
        15000,
      );
      function fail() {
        clearTimeout(timer);
        reject(new Error('Could not decode this video to capture a poster. Try another file.'));
      }
      function capture() {
        try {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) return fail();
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (result) => {
              clearTimeout(timer);
              if (result) resolve(result);
              else fail();
            },
            'image/jpeg',
            0.85,
          );
        } catch {
          fail();
        }
      }
      video.onerror = fail;
      video.onloadeddata = () => {
        if (Number.isFinite(video.duration) && video.duration > 0.1)
          video.currentTime = Math.min(0.1, video.duration / 2);
        else capture();
      };
      video.onseeked = capture;
      video.src = url;
      video.load();
    });
    return new File([blob], 'poster.jpg', { type: 'image/jpeg' });
  } finally {
    video.onloadeddata = null;
    video.onseeked = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function uploadBackground(
  file: File,
  userId: string,
  kind: string,
  progress: (value: number) => void,
) {
  const extensions: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const path = `${userId}/${kind}-${crypto.randomUUID()}.${extensions[file.type]}`;
  const { data, error } = await supabase!.auth.getSession();
  if (error || !data.session) throw new Error('Please sign in again before uploading.');
  progress(0);
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/media/${path}`);
    request.setRequestHeader('Authorization', `Bearer ${data.session!.access_token}`);
    request.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY);
    request.setRequestHeader('Content-Type', file.type);
    request.timeout = 120000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = request.ontimeout = () =>
      reject(new Error('Upload failed. Check your connection and try again.'));
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(
            new Error(
              'Upload rejected. Check the file size and that 002_animated_bg.sql has been applied.',
            ),
          );
    request.send(file);
  });
  progress(100);
  return supabase!.storage.from('media').getPublicUrl(path).data.publicUrl;
}

// Delete only an exact, owned public Storage URL from this project's app buckets.
export function ownedBackgroundPath(value: string, userId: string, projectUrl: string) {
  try {
    const url = new URL(value);
    if (url.origin !== new URL(projectUrl).origin) return null;
    const match = url.pathname.match(
      /^\/storage\/v1\/object\/public\/(media|profile-assets)\/(.+)$/,
    );
    if (!match) return null;
    const path = decodeURIComponent(match[2]);
    if (
      !path.startsWith(`${userId}/`) ||
      path.split('/').some((part) => part === '..' || part === '.')
    )
      return null;
    return { bucket: match[1], path };
  } catch {
    return null;
  }
}

export async function removeOldBackgrounds(urls: string[], retained: string[], userId: string) {
  for (const url of new Set(urls)) {
    if (!url || retained.includes(url)) continue;
    const owned = ownedBackgroundPath(url, userId, import.meta.env.VITE_SUPABASE_URL);
    if (!owned) continue;
    const { error } = await supabase!.storage.from(owned.bucket).remove([owned.path]);
    if (error)
      throw new Error('Changes saved, but the old background could not be removed from Storage.');
  }
}
