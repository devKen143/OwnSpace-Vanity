import { gradientColors, gradientPresets } from '../lib/background';
import type { BackgroundTheme } from '../lib/profile';

export function BackgroundEditor({
  bg,
  onChange,
  onFile,
}: {
  bg: BackgroundTheme;
  onChange: (bg: BackgroundTheme) => void;
  onFile: (file: File | undefined) => void;
}) {
  const gradient = bg.type === 'gradient' || bg.type === 'animated-gradient';
  const colors = gradientColors(bg);
  function typeChanged(type: BackgroundTheme['type']) {
    onChange({
      type,
      dim: bg.dim,
      value:
        type === 'solid'
          ? '#18263f'
          : type === 'gradient'
            ? gradientPresets.aurora.slice(0, 2)
            : type === 'animated-gradient'
              ? [...gradientPresets.aurora]
              : '',
      preset: 'aurora',
    });
  }
  return (
    <>
      <label>
        Background
        <select
          aria-label="Background"
          value={bg.type}
          onChange={(event) => typeChanged(event.target.value as BackgroundTheme['type'])}
        >
          <option value="solid">Solid color</option>
          <option value="gradient">Gradient</option>
          <option value="animated-gradient">Animated gradient</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
      </label>
      {bg.type === 'animated-gradient' && (
        <label>
          Gradient preset
          <select
            aria-label="Gradient preset"
            value={bg.preset}
            onChange={(event) => {
              const preset = event.target.value as keyof typeof gradientPresets;
              onChange({ ...bg, preset, value: [...gradientPresets[preset]] });
            }}
          >
            {Object.keys(gradientPresets).map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </label>
      )}
      {bg.type === 'solid' && (
        <label>
          Background color
          <input
            type="color"
            value={typeof bg.value === 'string' ? bg.value : '#18263f'}
            onChange={(event) => onChange({ ...bg, value: event.target.value })}
          />
        </label>
      )}
      {gradient && (
        <div className="field-pair">
          {colors.map((color, index) => (
            <label key={index}>
              {bg.type === 'gradient'
                ? index
                  ? 'Gradient end'
                  : 'Gradient start'
                : `Color ${index + 1}`}
              <input
                type="color"
                value={color}
                onChange={(event) =>
                  onChange({
                    ...bg,
                    value: colors.map((value, position) =>
                      position === index ? event.target.value : value,
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      {(bg.type === 'image' || bg.type === 'video') && (
        <>
          <label>
            {bg.type === 'video' ? 'Upload background video' : 'Upload background'}
            <input
              aria-label={bg.type === 'video' ? 'Upload background video' : 'Upload background'}
              type="file"
              accept={
                bg.type === 'video'
                  ? 'video/mp4,video/webm'
                  : 'image/png,image/jpeg,image/webp,image/gif'
              }
              onChange={(event) => {
                onFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <small>
              {bg.type === 'video'
                ? 'MP4 or WebM · up to 10 MB. A poster is captured automatically. Videos are always muted.'
                : 'PNG, JPG, WebP, or GIF · up to 6 MB.'}
            </small>
          </label>
          {bg.value && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => onChange({ ...bg, value: '', poster: undefined })}
            >
              Remove background
            </button>
          )}
        </>
      )}
      <label>
        Background dim: {bg.dim}%
        <input
          aria-label="Background dim"
          type="range"
          min={0}
          max={80}
          value={bg.dim}
          onChange={(event) => onChange({ ...bg, dim: Number(event.target.value) })}
        />
      </label>
    </>
  );
}
