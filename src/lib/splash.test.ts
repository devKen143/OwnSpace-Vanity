import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  effectiveSplashColors,
  normalizeSplash,
  shouldEnterOnClick,
  splashDefaults,
} from './splash';

describe('splash options', () => {
  const profile = {
    splash_title: 'Legacy title',
    splash_message: 'Legacy subtitle',
  } as never;

  it('falls back and clamps invalid values while preserving old profiles', () => {
    const splash = normalizeSplash(
      {
        title: 'x'.repeat(61),
        subtitle: 'x'.repeat(121),
        buttonLabel: 'x'.repeat(25),
        cardOpacity: 140,
        blur: -4,
        cardColor: 'nope',
        emoji: 'abc',
      },
      profile,
    );
    expect(splash.title).toBe('Legacy title');
    expect(splash.subtitle).toBe('Legacy subtitle');
    expect(splash.buttonLabel).toBe(splashDefaults.buttonLabel);
    expect(splash.cardOpacity).toBe(100);
    expect(splash.blur).toBe(0);
    expect(splash.cardColor).toBe(splashDefaults.cardColor);
    expect(normalizeSplash(undefined, profile).title).toBe('Legacy title');
  });

  it('calculates readable colors against the effective card', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeGreaterThanOrEqual(21);
    const colors = effectiveSplashColors({
      ...normalizeSplash(undefined),
      cardColor: '#000000',
      cardOpacity: 100,
    });
    expect(contrastRatio(colors.textColor, '#000000')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.buttonTextColor, colors.buttonColor)).toBeGreaterThanOrEqual(4.5);
  });

  it('only enables empty-space entry when configured', () => {
    expect(shouldEnterOnClick(true, false)).toBe(true);
    expect(shouldEnterOnClick(true, true)).toBe(false);
    expect(shouldEnterOnClick(false, false)).toBe(false);
  });

  it('keeps legacy card profiles unchanged and supports plain defaults', () => {
    expect(normalizeSplash({ title: 'Legacy card' }).layout).toBe('card');
    expect(normalizeSplash(undefined).layout).toBe('card');
    expect(normalizeSplash({ layout: 'plain' }).title).toBe(
      'Welcome to my page, click to enter!',
    );
    expect(normalizeSplash({ layout: 'plain' }).clickAnywhere).toBe(true);
  });
});
