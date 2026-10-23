import { describe, expect, it } from 'vitest';
import { getLayoutOptions, layoutTextColor, normalizeLayoutOptions } from './layout';

describe('split layout options', () => {
  it('clamps values and falls back safely', () => {
    const options = normalizeLayoutOptions({
      side: 'invalid',
      angle: 30,
      panelWidth: 10,
      panelOpacity: -2,
      panelBlur: 40,
      panelColor: 'invalid',
      contentAlign: 'invalid',
    });
    expect(options).toMatchObject({
      side: 'right',
      angle: 20,
      panelWidth: 35,
      panelOpacity: 0,
      panelBlur: 24,
      panelColor: '#101413',
      contentAlign: 'start',
    });
  });

  it('keeps old profiles at the design defaults', () => {
    expect(getLayoutOptions({ theme: {} } as never).panelWidth).toBe(45);
    expect(layoutTextColor(normalizeLayoutOptions({ panelColor: '#ffffff' }))).toBe('#000000');
  });
});
