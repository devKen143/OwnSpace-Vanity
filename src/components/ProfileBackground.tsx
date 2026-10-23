import { useEffect, useState } from 'react';
import { backgroundTheme, gradientColors, mediaUrl } from '../lib/background';
import type { Profile } from '../lib/profile';

type Connection = EventTarget & { saveData?: boolean };
function connection() {
  return (navigator as Navigator & { connection?: Connection }).connection;
}
function useStaticBackground() {
  const [still, setStill] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || !!connection()?.saveData,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const network = connection();
    const update = () => setStill(query.matches || !!network?.saveData);
    query.addEventListener('change', update);
    network?.addEventListener('change', update);
    update();
    return () => {
      query.removeEventListener('change', update);
      network?.removeEventListener('change', update);
    };
  }, []);
  return still;
}

export function ProfileBackground({
  profile,
  preview = false,
}: {
  profile: Profile;
  preview?: boolean;
}) {
  const bg = backgroundTheme(profile);
  const source = mediaUrl(bg.value, preview);
  const poster = mediaUrl(bg.poster, preview);
  const still = useStaticBackground();
  const [failed, setFailed] = useState<string | undefined>();
  const [posterFailed, setPosterFailed] = useState<string | undefined>();
  const gradient = bg.type === 'gradient' || bg.type === 'animated-gradient';
  const solid =
    bg.type === 'solid' && typeof bg.value === 'string' && /^#[\da-fA-F]{6}$/.test(bg.value)
      ? bg.value
      : profile.background_color;
  const animatedImage =
    typeof bg.value === 'string' &&
    (/\.(gif|webp)(?:[?#]|$)/i.test(bg.value) || (preview && bg.value.startsWith('blob:')));
  const image =
    bg.type === 'video' || (bg.type === 'image' && still && (poster || animatedImage))
      ? poster
      : source;
  return (
    <div
      className={`profile-background ${bg.type === 'animated-gradient' ? 'gradient-background' : ''} ${bg.type === 'animated-gradient' && !still ? 'animated-background' : ''}`}
      aria-hidden="true"
      style={{
        backgroundColor: solid || '#f6f3ec',
        backgroundImage: gradient
          ? `linear-gradient(135deg, ${gradientColors(bg).join(', ')})`
          : undefined,
      }}
    >
      {bg.type === 'video' && source && !still && failed !== source ? (
        <video
          key={source}
          src={source}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          ref={(video) => {
            if (video) {
              video.muted = true;
              video.defaultMuted = true;
            }
          }}
          onError={() => setFailed(source)}
          onCanPlay={(event) => {
            const video = event.currentTarget;
            void video.play().catch(() => setFailed(source));
          }}
        />
      ) : (bg.type === 'image' || bg.type === 'video') && image && posterFailed !== image ? (
        <img src={image} alt="" onError={() => setPosterFailed(image)} />
      ) : null}
      <div className="background-dim" style={{ opacity: bg.dim / 100 }} />
    </div>
  );
}
