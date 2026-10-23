import type { CSSProperties } from 'react';
import type { Profile } from './profile';
import { contrastRatio, isHexColor } from './splash';

export const layoutDefaults = {
  side: 'right',
  angle: 8,
  panelWidth: 45,
  panelOpacity: 82,
  panelBlur: 14,
  panelColor: '#101413',
  contentAlign: 'start',
} as const;

export type LayoutOptions = {
  side: 'right' | 'left';
  angle: number;
  panelWidth: number;
  panelOpacity: number;
  panelBlur: number;
  panelColor: string;
  contentAlign: 'start' | 'center';
};

export function normalizeLayoutOptions(value: unknown): LayoutOptions {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    side: input.side === 'left' || input.side === 'right' ? input.side : layoutDefaults.side,
    angle: clamp(input.angle, 0, 20, layoutDefaults.angle),
    panelWidth: clamp(input.panelWidth, 35, 60, layoutDefaults.panelWidth),
    panelOpacity: clamp(input.panelOpacity, 0, 100, layoutDefaults.panelOpacity),
    panelBlur: clamp(input.panelBlur, 0, 24, layoutDefaults.panelBlur),
    panelColor: isHexColor(input.panelColor) ? input.panelColor : layoutDefaults.panelColor,
    contentAlign: input.contentAlign === 'center' ? 'center' : layoutDefaults.contentAlign,
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function layoutTextColor(options: LayoutOptions) {
  return contrastRatio('#ffffff', options.panelColor) >= 4.5 ? '#ffffff' : '#000000';
}

export function layoutStyle(options: LayoutOptions): CSSProperties {
  return {
    '--split-side': options.side,
    '--split-angle': `${options.angle}deg`,
    '--split-width': `${options.panelWidth}%`,
    '--split-panel': `${options.panelColor}${Math.round(options.panelOpacity * 2.55)
      .toString(16)
      .padStart(2, '0')}`,
    '--split-blur': `${options.panelBlur}px`,
    color: layoutTextColor(options),
  } as CSSProperties;
}

export function getLayoutOptions(profile: Profile) {
  return normalizeLayoutOptions(profile.theme?.layoutOptions);
}
