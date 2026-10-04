import { useEffect, useRef } from 'react';
import { go } from '../App';
import { Icon } from '../components/Guide';

// Adds the "in" class when an element scrolls into view; everything stays visible if IntersectionObserver is missing.
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>('.reveal'); if (!els) return;
    if (typeof IntersectionObserver === 'undefined') { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, []);
  return root;
}

const STEPS = [
  { icon: 'upload', title: 'Add your details', text: 'Upload your resume and paste the job post.' },
  { icon: 'search', title: 'Check the evidence', text: 'See the exact resume line behind each requirement.' },
  { icon: 'edit', title: 'Improve your resume', text: 'Sharper wording built only from facts you approved.' },
  { icon: 'mic', title: 'Practice the interview', text: 'Answer questions about your own experience.' },
] as const;

const FEATURES = [
  { icon: 'shield', title: 'Quotes you can verify', text: 'Every match shows the exact words from your resume, highlighted. If the words are not there, nothing is claimed.' },
  { icon: 'check', title: 'You make the calls', text: 'Approve, reject, or add context to each requirement. Only what you approve is ever used.' },
  { icon: 'spark', title: 'No invented claims', text: 'Suggested rewrites cannot add numbers, tools or names you did not provide. Anything new is flagged for you.' },
  { icon: 'mic', title: 'Practice on your bullets', text: 'Pick one bullet and get three different angles on it, like a real interviewer digging in.' },
  { icon: 'pdf', title: 'A clean PDF, ready to send', text: 'Export your improved resume in a polished, recruiter-friendly layout in one click.' },
  { icon: 'save', title: 'Pick up where you left off', text: 'Your decisions and practice sessions are saved automatically, so you can come back any time.' },
] as const;

export function Landing() {
  const root = useReveal();
  const how = () => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="landing" ref={root}>
      <div className="lp-bg" aria-hidden><i className="orb o1" /><i className="orb o2" /><i className="orb o3" /><i className="grid" /></div>

      <section className="lp-hero">
        <div className="lp-copy">
          <span className="lp-pill rise"><Icon name="spark" size={14} /> Evidence-first interview prep</span>
          <h1 className="rise" style={{ ['--i' as string]: 1 }}>Walk into the interview knowing <span className="grad-text">what your resume can prove.</span></h1>
          <p className="lp-lead rise" style={{ ['--i' as string]: 2 }}>ProofPrep links every requirement in a job post to the exact words on your resume, lets you confirm each match, then helps you practice talking about it.</p>
          <div className="row rise" style={{ ['--i' as string]: 3, marginTop: 26, gap: 12 }}>
            <button className="btn primary big" onClick={() => go('#/new')}>Get started <Icon name="arrow" size={18} /></button>
            <button className="btn big" onClick={how}>See how it works</button>
          </div>
          <ul className="lp-trust rise" style={{ ['--i' as string]: 4 }}>
            <li><Icon name="shield" size={16} /> Every quote traced to your resume</li>
            <li><Icon name="check" size={16} /> You approve every change</li>
            <li><Icon name="pdf" size={16} /> Polished PDF export</li>
          </ul>
        </div>

        <div className="lp-visual" aria-hidden>
          <div className="pv-card pv-main rise" style={{ ['--i' as string]: 2 }}>
            <div className="pv-head"><div><div className="pv-title">Build robust back-end systems</div><div className="pv-quote">“building robust back-end systems”</div></div><span className="chip supported">Evidence found</span></div>
            <div className="pv-evidence"><span className="pv-src">S33</span>Engineered a <mark>FastAPI + PyTorch inference pipeline</mark> with artery-specific overlays and a Supabase-backed case store.</div>
            <div className="pv-actions"><span className="pv-btn on">Yes, this proves it</span><span className="pv-btn">Not really</span><span className="pv-btn">Add context</span></div>
          </div>
          <div className="pv-card pv-q float-b rise" style={{ ['--i' as string]: 4 }}>
            <div className="pv-label"><Icon name="mic" size={14} /> Interview question</div>
            <p>Walk me through a hard decision you made while building that pipeline.</p>
            <div className="pv-lines"><i /><i style={{ width: '72%' }} /></div>
          </div>
          <div className="pv-badge float-a rise" style={{ ['--i' as string]: 5 }}><Icon name="check" size={14} /> Quote verified</div>
          <div className="pv-badge pv-step float-c rise" style={{ ['--i' as string]: 6 }}>Step 2 of 4 · You decide</div>
        </div>
      </section>

      <section className="lp-section" id="how">
        <div className="lp-head reveal"><span className="lp-eyebrow">How it works</span><h2>From job post to interview-ready in four steps</h2></div>
        <ol className="lp-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="lp-step reveal" style={{ ['--d' as string]: `${i * 90}ms` }}>
              <span className="lp-num">{i + 1}</span>
              <div className="lp-ico"><Icon name={s.icon} size={22} /></div>
              <h3>{s.title}</h3><p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section">
        <div className="lp-head reveal"><span className="lp-eyebrow">Why it feels different</span><h2>Honest by design</h2><p>Most tools tell you what to claim. ProofPrep shows you what your resume already proves, and leaves the judgment to you.</p></div>
        <div className="lp-grid">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="lp-feature reveal" style={{ ['--d' as string]: `${(i % 3) * 90}ms` }}>
              <div className="lp-ico"><Icon name={f.icon} size={22} /></div>
              <h3>{f.title}</h3><p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-showcase">
        <div className="reveal">
          <span className="lp-eyebrow">Export</span>
          <h2>A resume that reads like a resume</h2>
          <p className="lp-sub">Clear sections, aligned dates, tidy bullets and a recruiter-friendly layout. Your approved wording, nothing else.</p>
          <button className="btn primary big" style={{ marginTop: 20 }} onClick={() => go('#/new')}>Build yours <Icon name="arrow" size={18} /></button>
        </div>
        <div className="paper reveal" style={{ ['--d' as string]: '120ms' }} aria-hidden>
          <div className="paper-name" /><div className="paper-sub" />
          <div className="paper-h" /><div className="paper-row"><i style={{ width: '46%' }} /><i style={{ width: '16%' }} /></div>
          <div className="paper-li"><b /><i style={{ width: '92%' }} /></div><div className="paper-li"><b /><i style={{ width: '78%' }} /></div>
          <div className="paper-h" /><div className="paper-row"><i style={{ width: '52%' }} /><i style={{ width: '14%' }} /></div>
          <div className="paper-li"><b /><i style={{ width: '88%' }} /></div><div className="paper-li"><b /><i style={{ width: '70%' }} /></div><div className="paper-li"><b /><i style={{ width: '84%' }} /></div>
          <div className="paper-h" /><div className="paper-li"><b /><i style={{ width: '60%' }} /></div>
        </div>
      </section>

      <section className="lp-cta reveal">
        <h2>Ready to see what your resume can prove?</h2>
        <p>It takes about a minute to add your details.</p>
        <button className="btn big lp-cta-btn" onClick={() => go('#/new')}>Get started <Icon name="arrow" size={18} /></button>
      </section>
      <footer className="lp-foot">ProofPrep · Evidence-first interview prep</footer>
    </div>
  );
}
