import type { CSSProperties } from 'react';
import { fonts, type Profile } from './profile';

export function profileTheme(profile: Profile): CSSProperties {
  return {
    '--accent': profile.accent_color,
    color: profile.text_color,
    fontFamily: `"${fonts.find((font) => font === profile.font) || 'DM Sans'}", sans-serif`,
  } as CSSProperties;
}
