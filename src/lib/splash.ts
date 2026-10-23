import type { Profile } from './profile';

export const splashDefaults = {
  title: 'Welcome to my page, click to enter!',
  layout: 'plain',
  subtitle: '',
  buttonLabel: 'Enter this space ↗',
  icon: 'asterisk',
  emoji: '✨',
  cardStyle: 'glass',
  cardColor: '#ffffff',
  cardOpacity: 78,
  blur: 12,
  textColor: '#203629',
  buttonColor: '#305b43',
  buttonTextColor: '#ffffff',
  autoContrast: true,
  size: 'standard',
  align: 'center',
  enter: 'fade',
  exit: 'fade',
  clickAnywhere: false,
  showBackHome: true,
  preset: 'Glass',
  pulse: false,
} as const;

export type SplashOptions = {
  title: string;
  layout: 'plain' | 'card';
  subtitle: string;
  buttonLabel: string;
  icon: 'asterisk' | 'avatar' | 'emoji' | 'none';
  emoji: string;
  cardStyle: 'glass' | 'solid' | 'outline' | 'none';
  cardColor: string;
  cardOpacity: number;
  blur: number;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  autoContrast: boolean;
  size: 'compact' | 'standard' | 's' | 'm' | 'l';
  align: 'center' | 'left';
  enter: 'fade' | 'scale' | 'slide' | 'none';
  exit: 'fade' | 'scale' | 'slide' | 'none';
  clickAnywhere: boolean;
  showBackHome: boolean;
  preset: string;
  pulse: boolean;
};

const splashEnums = {
  icon: ['asterisk', 'avatar', 'emoji', 'none'],
  cardStyle: ['glass', 'solid', 'outline', 'none'],
  size: ['compact', 'standard', 's', 'm', 'l'],
  layout: ['plain', 'card'],
  align: ['center', 'left'],
  enter: ['fade', 'scale', 'slide', 'none'],
  exit: ['fade', 'scale', 'slide', 'none'],
} as const;

export const splashPresets: Record<string, Partial<SplashOptions>> = {
  Plain: {
    ...splashDefaults,
    preset: 'Plain',
    title: 'Welcome to my page, click to enter!',
    layout: 'plain',
    cardStyle: 'none',
    clickAnywhere: true,
  },
  Glass: { ...splashDefaults, preset: 'Glass', layout: 'card' },
  Minimal: {
    ...splashDefaults,
    preset: 'Minimal',
    layout: 'card',
    cardStyle: 'none',
    blur: 0,
    cardOpacity: 0,
    icon: 'none',
  },
  Solid: {
    ...splashDefaults,
    preset: 'Solid',
    layout: 'card',
    cardStyle: 'solid',
    cardOpacity: 100,
    blur: 0,
  },
  Outline: {
    ...splashDefaults,
    preset: 'Outline',
    layout: 'card',
    cardStyle: 'outline',
    cardOpacity: 0,
    blur: 0,
  },
};

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-fA-F]{6}$/.test(value);
}

function singleEmoji(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const candidate = value.trim();
  try {
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(candidate)];
    return segments.length === 1 && /\p{Extended_Pictographic}/u.test(candidate);
  } catch {
    return /^\p{Extended_Pictographic}$/u.test(candidate);
  }
}

function enumValue<T extends keyof typeof splashEnums>(
  value: unknown,
  key: T,
): SplashOptions[T] {
  return (splashEnums[key] as readonly string[]).includes(value as string)
    ? (value as SplashOptions[T])
    : splashDefaults[key];
}

export function normalizeSplash(value: unknown, profile?: Profile): SplashOptions {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const fallbackTitle =
    (profile?.splash_text || profile?.splash_title) &&
    (profile.splash_text || profile.splash_title).length <= 60
      ? profile.splash_text || profile.splash_title
      : splashDefaults.title;
  const fallbackSubtitle =
    profile?.splash_message && profile.splash_message.length <= 120
      ? profile.splash_message
      : '';
  return {
    title:
      typeof input.title === 'string' && input.title.length <= 60 ? input.title : fallbackTitle,
    layout:
      input.layout === 'plain' || input.layout === 'card'
        ? input.layout
        : 'card',
    subtitle:
      typeof input.subtitle === 'string' && input.subtitle.length <= 120
        ? input.subtitle
        : fallbackSubtitle,
    buttonLabel:
      typeof input.buttonLabel === 'string' && input.buttonLabel.length <= 24
        ? input.buttonLabel
        : splashDefaults.buttonLabel,
    icon: enumValue(input.icon, 'icon'),
    emoji: singleEmoji(input.emoji) ? input.emoji.trim() : splashDefaults.emoji,
    cardStyle: enumValue(input.cardStyle, 'cardStyle'),
    cardColor: isHexColor(input.cardColor) ? input.cardColor : splashDefaults.cardColor,
    cardOpacity: clampNumber(input.cardOpacity, 0, 100, splashDefaults.cardOpacity),
    blur: clampNumber(input.blur, 0, 24, splashDefaults.blur),
    textColor: isHexColor(input.textColor) ? input.textColor : splashDefaults.textColor,
    buttonColor: isHexColor(input.buttonColor) ? input.buttonColor : splashDefaults.buttonColor,
    buttonTextColor: isHexColor(input.buttonTextColor)
      ? input.buttonTextColor
      : splashDefaults.buttonTextColor,
    autoContrast: typeof input.autoContrast === 'boolean' ? input.autoContrast : true,
    size: enumValue(input.size, 'size'),
    align: enumValue(input.align, 'align'),
    enter: enumValue(input.enter, 'enter'),
    exit: enumValue(input.exit, 'exit'),
    clickAnywhere:
      typeof input.clickAnywhere === 'boolean'
        ? input.clickAnywhere
        : (input.layout === 'plain' ? true : false),
    showBackHome: typeof input.showBackHome === 'boolean' ? input.showBackHome : true,
    preset: typeof input.preset === 'string' ? input.preset : splashDefaults.preset,
    pulse: typeof input.pulse === 'boolean' ? input.pulse : false,
  };
}

export function shouldEnterOnClick(clickAnywhere: boolean, targetIsInteractive: boolean) {
  return clickAnywhere && !targetIsInteractive;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function hexRgb(hex: string) {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
}

function luminance(hex: string) {
  return hexRgb(hex).reduce((sum, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

export function contrastRatio(first: string, second: string) {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

export function effectiveSplashColors(
  splash: SplashOptions,
  background = '#f6f3ec',
): { textColor: string; buttonColor: string; buttonTextColor: string } {
  if (!splash.autoContrast) {
    return {
      textColor: splash.textColor,
      buttonColor: splash.buttonColor,
      buttonTextColor: splash.buttonTextColor,
    };
  }
  if (splash.layout === 'plain') {
    const textColor = contrastRatio('#ffffff', background) >= 4.5 ? '#ffffff' : '#000000';
    return { textColor, buttonColor: splash.buttonColor, buttonTextColor: splash.buttonTextColor };
  }
  const card = splash.cardColor;
  const ratio = splash.cardOpacity / 100;
  const blended = `#${hexRgb(card)
    .map((channel, index) =>
      Math.round((channel * ratio + hexRgb(background)[index] * (1 - ratio)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
  const textColor = contrastRatio('#203629', blended) >= 4.5 ? '#203629' : '#ffffff';
  const buttonColor = contrastRatio('#305b43', blended) >= 4.5 ? '#305b43' : '#ffffff';
  const buttonTextColor = contrastRatio(buttonColor, '#ffffff') >= 4.5 ? '#ffffff' : '#203629';
  return { textColor, buttonColor, buttonTextColor };
}
