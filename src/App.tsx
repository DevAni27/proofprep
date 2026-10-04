import { useCallback, useEffect, useState } from 'react';
import { api, type Health } from './lib/api';
import { Applications } from './screens/Applications';
import { ApplicationShell } from './screens/ApplicationShell';
import { Landing } from './screens/Landing';
import { HelpDrawer, Icon } from './components/Guide';

// Hash routing keeps the app a single static page served by the Node backend; no router dependency.
export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => { const on = () => setHash(window.location.hash || '#/'); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return hash;
}
export const go = (to: string) => { window.location.hash = to; };

type Theme = 'light' | 'dark';
function initialTheme(): Theme {
  try { const t = localStorage.getItem('pp-theme'); if (t === 'light' || t === 'dark') return t; } catch { /* storage may be unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a1310' : '#f6f7f4');
    try { localStorage.setItem('pp-theme', theme); } catch { /* optional */ }
  }, [theme]);
  return { theme, toggle: useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []) };
}

export function App() {
  const hash = useHash();
  const { theme, toggle } = useTheme();
  const [health, setHealth] = useState<Health | null>(null);
  const [help, setHelp] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 24); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  useEffect(() => {
    let alive = true;
    const tick = () => api.health().then(h => alive && setHealth(h)).catch(() => alive && setHealth({ backend: 'unreachable', ollama: 'unavailable', roles: [] }));
    tick(); const t = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const m = hash.match(/^#\/app\/([\w-]+)(?:\/(\w+))?/);
  if (m && m[2] === 'practise') { window.location.replace(`#/app/${m[1]}/practice`); }
  const ready = health?.ollama === 'connected';
  const landing = !m && (hash === '#/' || hash === '#' || hash === '');
  return (
    <>
      <header className={`topbar ${landing ? 'on-landing' : ''} ${scrolled ? 'scrolled' : ''}`}>
        <div className="topbar-inner">
          <button className="btn ghost theme-toggle" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
          <a className="brand" href="#/"><span className="brand-mark" aria-hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg></span>ProofPrep</a>
          <span className="spacer" />
          <div className="status" title={ready ? 'Ready' : 'The analysis engine is not running yet'}>
            <span className={`dot ${health ? (ready ? 'on' : 'off') : ''}`} />
            {health ? (ready ? 'Ready' : (health.backend === 'unreachable' ? 'Server unreachable' : 'Engine offline')) : 'Checking…'}
          </div>
          {!landing && <a className="btn small ghost" href="#/applications">Applications</a>}
          <button className="btn small" onClick={() => setHelp(true)} aria-label="Open help"><Icon name="help" size={16} /> How it works</button>
        </div>
      </header>
      <HelpDrawer open={help} onClose={() => setHelp(false)} />
      {m ? <ApplicationShell id={m[1]} tab={(m[2] as 'inputs' | 'review' | 'tailor' | 'practice' | undefined) ?? undefined} health={health} />
        : landing ? <Landing />
        : <Applications health={health} newApp={hash === '#/new'} />}
    </>
  );
}
