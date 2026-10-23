import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { effectiveSplashColors, normalizeSplash, shouldEnterOnClick } from '../lib/splash';
import type { Profile } from '../lib/profile';

export function SplashScreen({
  profile,
  preview = false,
  onEnter,
}: {
  profile: Profile;
  preview?: boolean;
  onEnter: () => void;
}) {
  const splash = normalizeSplash(profile.theme?.splash, profile);
  const colors = effectiveSplashColors(splash, profile.background_color);
  const [exiting, setExiting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  function enter() {
    if (exiting) return;
    if (reducedMotion || splash.exit === 'none') {
      onEnter();
      return;
    }
    setExiting(true);
    window.setTimeout(onEnter, 250);
  }
  function click(event: MouseEvent<HTMLElement>) {
    if (shouldEnterOnClick(splash.clickAnywhere, !!(event.target as HTMLElement).closest('a, button')))
      enter();
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (splash.layout === 'plain' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      enter();
    }
  }
  if (splash.layout === 'plain') {
    return (
      <section
        className={`profile-splash plain-splash ${exiting ? 'is-exiting' : ''}`}
        onClick={click}
        style={{ color: colors.textColor }}
        aria-label="Profile welcome"
      >
        <div
          className={`plain-splash-text plain-size-${splash.size} ${splash.pulse ? 'plain-splash-pulse' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Enter page"
          onClick={enter}
          onKeyDown={keyDown}
        >
          {splash.title}
        </div>
      </section>
    );
  }
  const cardStyle =
    splash.cardStyle === 'none'
      ? {
          backgroundColor: 'transparent',
          border: '0',
          backdropFilter: 'none',
          boxShadow: 'none',
        }
      : {
          backgroundColor: `${splash.cardColor}${Math.round(splash.cardOpacity * 2.55)
            .toString(16)
            .padStart(2, '0')}`,
          backdropFilter: splash.cardStyle === 'glass' ? `blur(${splash.blur}px)` : undefined,
          border:
            splash.cardStyle === 'outline' ? `1px solid ${colors.textColor}` : undefined,
        };
  return (
    <section
      className={`profile-splash splash-align-${splash.align} splash-size-${splash.size} splash-enter-${splash.enter} splash-exit-${splash.exit} ${exiting ? 'is-exiting' : ''} ${splash.cardStyle === 'none' ? 'cardless' : ''}`}
      onClick={click}
      style={{ color: colors.textColor }}
      aria-label="Profile welcome"
    >
      <div className="splash-card" style={cardStyle}>
        {splash.icon !== 'none' && (
          <span className="splash-symbol" aria-hidden="true">
            {splash.icon === 'avatar' && profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" />
            ) : splash.icon === 'emoji' ? (
              splash.emoji
            ) : (
              '✳'
            )}
          </span>
        )}
        <h1>{splash.title}</h1>
        {splash.subtitle && <p>{splash.subtitle}</p>}
        <button
          className="profile-link splash-button"
          onClick={enter}
          style={{ backgroundColor: colors.buttonColor, color: colors.buttonTextColor }}
        >
          {splash.buttonLabel}
        </button>
        {splash.showBackHome && !preview && <Link to="/">Back home</Link>}
      </div>
    </section>
  );
}
