import { safeUrl, type BackgroundTheme, type Profile } from './profile';

export const gradientPresets = {
  aurora: ['#144e43', '#5b34a1', '#158278', '#18263f'],
  sunset: ['#fa6b45', '#a02c65', '#502d83', '#efad65'],
  ocean: ['#072e51', '#126b8c', '#329b94', '#18377b'],
  mono: ['#141414', '#606060', '#303030', '#8c8c8c'],
} as const;

export function backgroundTheme(profile: Profile): BackgroundTheme {
  const bg = profile.theme?.bg;
  const legacyType = profile.background_type === 'color' ? 'solid' : profile.background_type;
  const type =
    bg?.type && ['solid', 'gradient', 'animated-gradient', 'image', 'video'].includes(bg.type)
      ? bg.type
      : legacyType || 'solid';
  const value =
    bg?.value ??
    (type === 'gradient'
      ? [profile.background_color, profile.gradient_to]
      : type === 'image'
        ? profile.background_image || ''
        : type === 'animated-gradient'
          ? [...gradientPresets.aurora]
          : profile.background_color || '#f6f3ec');
  return {
    type,
    value,
    poster: bg?.poster,
    preset: bg?.preset || 'aurora',
    dim:
      typeof bg?.dim === 'number' && Number.isFinite(bg.dim)
        ? Math.min(80, Math.max(0, bg.dim))
        : 30,
  };
}

export function gradientColors(bg: BackgroundTheme): string[] {
  const colors = Array.isArray(bg.value) ? bg.value : bg.value.match(/#[\da-fA-F]{6}\b/g) || [];
  const valid = colors.filter((color) => /^#[\da-fA-F]{6}$/.test(color));
  return valid.length >= 2
    ? valid
    : [...gradientPresets[bg.preset && bg.preset in gradientPresets ? bg.preset : 'aurora']];
}

export function mediaUrl(value: unknown, preview = false) {
  if (typeof value !== 'string') return undefined;
  return preview && value.startsWith('blob:') ? value : safeUrl(value);
}

export function backgroundFileError(file: Pick<File, 'size' | 'type'>, video: boolean) {
  const allowed = video
    ? ['video/mp4', 'video/webm']
    : ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type))
    return video ? 'Choose an MP4 or WebM video.' : 'Choose a PNG, JPG, WebP, or GIF image.';
  if (file.size > (video ? 10 : 6) * 1024 * 1024)
    return `Choose a file no larger than ${video ? 10 : 6} MB.`;
  return '';
}
