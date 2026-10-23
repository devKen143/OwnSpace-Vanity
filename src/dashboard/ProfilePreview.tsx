import { ProfileBackground } from '../components/ProfileBackground';
import { useState } from 'react';
import { profileTheme } from '../lib/theme';
import { type Profile, type ProfileLink, type Social } from '../lib/profile';

export function ProfilePreview({
  profile,
  links,
  socials,
}: {
  profile: Profile;
  links: ProfileLink[];
  socials: Social[];
}) {
  const [showSplash, setShowSplash] = useState(false);
  return (
    <aside className="preview-pane">
      <div className="preview-label">
        <span className="eyebrow">LIVE PREVIEW</span>
        <span>Not published until saved</span>
      </div>
      {profile.splash_enabled && (
        <button className="quiet-button" onClick={() => setShowSplash(!showSplash)}>
          {showSplash ? 'Preview profile' : 'Preview splash'}
        </button>
      )}
      <div className="preview-window">
        <div
          className={`profile-page ${profile.layout} ${profile.splash_enabled && showSplash ? 'splash' : ''}`}
          style={profileTheme(profile)}
        >
          <ProfileBackground profile={profile} preview />
          {profile.splash_enabled && showSplash ? (
            <section className="splash-card">
              <span className="splash-symbol">✳</span>
              <h1>{profile.splash_title}</h1>
              <p>{profile.splash_message}</p>
              <button className="profile-link" onClick={() => setShowSplash(false)}>
                Enter this space ↗
              </button>
            </section>
          ) : (
            <>
              <div className="profile-content">
                <header className="profile-identity">
                  {profile.avatar_url ? (
                    <img className="profile-avatar" src={profile.avatar_url} alt="Avatar preview" />
                  ) : (
                    <div className="profile-avatar initials">
                      {(profile.display_name || profile.username).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="eyebrow">@{profile.username}</span>
                  <h1>{profile.display_name || profile.username}</h1>
                  <p className="bio">{profile.bio}</p>
                  <span className="view-count">{profile.view_count.toLocaleString()} views</span>
                </header>
                <section className="profile-links" aria-label="Preview links">
                  {[...links]
                    .sort(
                      (a, b) =>
                        Number(b.is_pinned) - Number(a.is_pinned) || a.position - b.position,
                    )
                    .map((link) => (
                      <div
                        key={link.id}
                        className={`profile-link ${link.is_pinned ? 'pinned' : ''}`}
                      >
                        <span>
                          {link.is_pinned ? '✦ ' : ''}
                          {link.title}
                        </span>
                        <span>↗</span>
                      </div>
                    ))}
                  {!links.length && <p className="empty-links">Your links will appear here.</p>}
                  <div className="social-list">
                    {socials.map((social) => (
                      <span key={social.id}>
                        {social.platform}
                        {social.mode === 'copy' ? ' ⧉' : ' ↗'}
                      </span>
                    ))}
                  </div>
                </section>
              </div>
              <footer className="profile-footer">✳ Make your OwnSpace</footer>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
