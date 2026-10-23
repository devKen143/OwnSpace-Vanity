export const fonts = ['DM Sans', 'Inter', 'Lora', 'Space Grotesk', 'Manrope'] as const;
export const reserved = [
  'login',
  'signup',
  'reset-password',
  'account',
  'admin',
  'api',
  'www',
  'settings',
  'dashboard',
  'auth',
  'help',
];
export function usernameError(value: string) {
  if (!/^[a-z0-9_]{3,20}$/.test(value))
    return 'Use 3–20 lowercase letters, numbers, or underscores.';
  if (reserved.includes(value)) return 'This username is reserved.';
  return '';
}
export function safeUrl(value: string | null) {
  try {
    const url = new URL(value ?? '');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function deviceType(ua: string) {
  return /ipad|tablet|android(?!.*mobile)/i.test(ua)
    ? 'tablet'
    : /mobile|iphone|ipod/i.test(ua)
      ? 'mobile'
      : 'desktop';
}
export function referrerHost(referrer: string) {
  try {
    return new URL(referrer).hostname;
  } catch {
    return null;
  }
}
export interface Profile {
  theme?: { bg?: Partial<BackgroundTheme>; [key: string]: unknown };
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  is_public: boolean;
  layout: 'centered' | 'split';
  background_type: 'color' | 'gradient' | 'image';
  background_color: string;
  gradient_to: string;
  background_image: string | null;
  accent_color: string;
  text_color: string;
  font: string;
  splash_enabled: boolean;
  splash_title: string;
  splash_message: string;
  view_count: number;
  deletion_pending?: boolean;
}
export interface BackgroundTheme {
  type: 'solid' | 'gradient' | 'animated-gradient' | 'image' | 'video';
  value: string | string[];
  poster?: string;
  dim: number;
  preset?: 'aurora' | 'sunset' | 'ocean' | 'mono';
}
export interface ProfileLink {
  id: string;
  profile_id: string;
  title: string;
  url: string;
  is_pinned: boolean;
  position: number;
}
export interface Social {
  id: string;
  profile_id: string;
  platform: string;
  value: string;
  mode: 'link' | 'copy';
  position: number;
}
