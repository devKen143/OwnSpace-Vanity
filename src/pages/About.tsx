import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usernameError } from '../lib/profile';
export function About() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  function claim(event: FormEvent) {
    event.preventDefault();
    const error = usernameError(username);
    setError(error);
    if (!error) navigate(`/signup?username=${encodeURIComponent(username)}`);
  }
  return (
    <div className="landing">
      <header className="site-header">
        <Link className="brand" to="/">
          ✳ OwnSpace
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/login">Log in</Link>
          <Link className="button button-small" to="/signup">
            Find your space ↗
          </Link>
        </nav>
      </header>
      <main className="hero">
        <section className="hero-copy">
          <span className="eyebrow">
            <span className="dot" /> A PLACE TO BE YOURSELF
          </span>
          <h1>
            All your worlds.
            <br />
            One little <em>space.</em>
          </h1>
          <p>
            Your work, your passions, your next big thing.
            <br className="desktop-break" /> Bring them together in a page that feels like you.
          </p>
          <form className="claim" onSubmit={claim}>
            <label htmlFor="claim-name">ownspace /</label>
            <input
              id="claim-name"
              aria-label="Your username"
              placeholder="yourname"
              autoComplete="username"
              value={username}
              maxLength={20}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
            />
            <button className="button">Claim your space ↗</button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <span className="hero-note">A home for your links. Room for your personality.</span>
        </section>
        <section className="preview-scene" aria-label="Example OwnSpace profile">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="floating-note">a little more you ↘</span>
          <article className="preview-card">
            <div className="preview-top">
              <span>ownspace / alex</span>
              <span>↗</span>
            </div>
            <div className="sample-avatar">
              a<span>✳</span>
            </div>
            <h2>Alex Morgan</h2>
            <p>
              Making things & finding the good.
              <br />
              Designer, daydreamer, coffee person.
            </p>
            <div className="sample-link featured">
              <span>✦ My latest work</span>
              <span>↗</span>
            </div>
            <div className="sample-link">
              <span>◈ The things I make</span>
              <span>↗</span>
            </div>
            <div className="sample-link">
              <span>☕ A little about me</span>
              <span>↗</span>
            </div>
            <div className="sample-socials">
              Instagram <span>·</span> YouTube <span>·</span> Email
            </div>
            <span className="sample-footer">MADE OF MANY THINGS.</span>
          </article>
          <span className="floating-star">✳</span>
          <span className="scene-label">YOUR LINKS. YOUR LOOK. YOUR SPACE.</span>
        </section>
      </main>
      <footer className="landing-footer">
        <span>Small page. Endless possibilities.</span>
        <div>
          <span>01 &nbsp; Make it yours</span>
          <span>02 &nbsp; Share your world</span>
          <span>03 &nbsp; Grow together</span>
        </div>
        <span>✳</span>
      </footer>
    </div>
  );
}
