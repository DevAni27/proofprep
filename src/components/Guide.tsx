import { useEffect, useState, type ReactNode } from 'react';
import { STATUS_HELP, STATUS_LABEL, type Status } from '../lib/api';

export type Tab = 'inputs' | 'review' | 'tailor' | 'practice';

export const Icon = ({ name, size = 20 }: { name: 'upload' | 'search' | 'check' | 'edit' | 'mic' | 'help' | 'arrow' | 'spark' | 'shield' | 'sun' | 'moon' | 'lock' | 'pdf' | 'save'; size?: number }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'upload': return <svg {...p}><path d="M12 16V4m0 0L7 9m5-5l5 5" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>;
    case 'search': return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case 'check': return <svg {...p}><path d="M5 13l4 4L19 7" /></svg>;
    case 'edit': return <svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>;
    case 'mic': return <svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v4" /></svg>;
    case 'help': return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 114 2c-.8.6-1.5 1-1.5 2M12 17h.01" /></svg>;
    case 'arrow': return <svg {...p}><path d="M5 12h14m-6-6l6 6-6 6" /></svg>;
    case 'spark': return <svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>;
    case 'sun': return <svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4l1.4-1.4" /></svg>;
    case 'moon': return <svg {...p}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>;
    case 'lock': return <svg {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>;
    case 'pdf': return <svg {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>;
    case 'save': return <svg {...p}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>;
    case 'shield': return <svg {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>;
  }
};

export const STEPS: { id: Tab; label: string; sub: string; title: string; happening: string; job: string; next: string }[] = [
  { id: 'inputs', label: 'Add details', sub: 'Resume + job post', title: 'Add your resume and the job post',
    happening: 'You give ProofPrep two things: your resume and the job description. It reads the job description and lists every skill and duty the employer asks for.',
    job: 'Upload or paste both. Check that the resume text came out clean (one bullet per line), then press “Find my evidence”.',
    next: 'ProofPrep matches each requirement to the exact words on your resume.' },
  { id: 'review', label: 'Check evidence', sub: 'You decide', title: 'Check the evidence for each requirement',
    happening: 'Each card shows one thing the job asks for and the exact resume line that seems to prove it, highlighted. Nothing is counted until you confirm it.',
    job: 'Read each card. Press “Yes, this proves it” if the line shows it, “Not really” if it doesn’t, or “Add context” to write what you did in your own words.',
    next: 'Only the evidence you approve is used to improve your resume and to ask interview questions.' },
  { id: 'tailor', label: 'Improve resume', sub: 'Optional', title: 'Improve your resume with approved facts',
    happening: 'For each line you approved, ProofPrep suggests a sharper version that echoes the job’s wording without adding anything new. Your original is always kept.',
    job: 'Tick the rewrites you like (changes are shown in green and red), then press “Save these edits”. Export the result as a PDF whenever you want. You can also skip this step.',
    next: 'Move on to interview practice built from the same approved facts.' },
  { id: 'practice', label: 'Practice interview', sub: 'Out loud, then type', title: 'Practice answering questions about your resume',
    happening: 'You get interview questions based only on facts you approved. After each answer you receive feedback and a follow-up, just like a real interviewer.',
    job: 'Say your answer out loud first, then type what you said and press “Get feedback”. Or pick one bullet to be drilled on from several angles.',
    next: 'Repeat as often as you like. Sessions are saved automatically.' },
];

export function StepGuide({ step, extra }: { step: Tab; extra?: ReactNode }) {
  const info = STEPS.find(s => s.id === step)!;
  const key = `pp-guide-${step}`;
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  const toggle = () => setCollapsed(c => { const n = !c; try { localStorage.setItem(key, n ? '1' : '0'); } catch { /* optional */ } return n; });
  return (
    <section className={`guide ${collapsed ? 'collapsed' : ''}`} aria-label="Guide for this step">
      <button className="guide-toggle" onClick={toggle} aria-expanded={!collapsed}>{collapsed ? 'Show guide' : 'Hide guide'}</button>
      <div className="eyebrow">Step {STEPS.findIndex(s => s.id === step) + 1} of 4</div>
      <h2>{info.title}</h2>
      <div className="guide-cols">
        <div className="guide-col"><b>What’s happening</b><p>{info.happening}</p></div>
        <div className="guide-col"><b>Your job</b><p>{info.job}</p></div>
        <div className="guide-col"><b>What comes next</b><p>{info.next}</p></div>
      </div>
      {!collapsed && extra}
    </section>
  );
}

export function Stepper({ active, done, unlocked, onGo }: { active: Tab; done: Record<Tab, boolean>; unlocked: (t: Tab) => boolean; onGo: (t: Tab) => void }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {STEPS.map((s, i) => {
        const ok = unlocked(s.id);
        return (
          <li key={s.id} className={`${active === s.id ? 'active' : ''} ${done[s.id] && active !== s.id ? 'done' : ''} ${ok ? 'link' : 'locked'}`} onClick={() => ok && onGo(s.id)} title={ok ? '' : 'Finish the earlier step first'} aria-current={active === s.id ? 'step' : undefined}>
            <span className="num">{done[s.id] && active !== s.id ? <Icon name="check" size={15} /> : i + 1}</span>
            <span><span className="lbl">{s.label}</span><br /><span className="sub">{s.sub}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

const FAQ: [string, string][] = [
  ['Does ProofPrep give me a score?', 'No. There is no match percentage and no hiring prediction. It only shows which lines of your resume back up each thing the job asks for, so you can decide.'],
  ['What does “No evidence found” mean?', 'Only that your resume doesn’t say it in words. It does not mean you lack the skill. Press “I do have this” and write what you did, and it becomes part of your approved facts.'],
  ['Will it make things up about me?', 'No. Every quote shown is checked against your resume text. Suggested rewrites may only use facts you approved, and anything that adds a new number, tool or name is marked “Check this detail” so you can keep it only if it is true.'],
  ['Is my information shared?', 'No. Your resume and job posts are used only to build your results, nothing is sent to anyone, and uploaded files are read and then discarded.'],
  ['How long does the analysis take?', 'Usually one to four minutes depending on the length of the job post. Keep this tab open; progress is shown on screen.'],
  ['Can I stop and come back later?', 'Yes. Your decisions are saved as you make them and your application stays in the list on the home page.'],
];

export function HelpDrawer({ open, onClose, }: { open: boolean; onClose: () => void; health?: unknown }) {
  useEffect(() => { if (!open) return; const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on); }, [open, onClose]);
  if (!open) return null;
  const order: Status[] = ['supported', 'partially_supported', 'not_evidenced', 'requires_confirmation', 'unverified'];
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Help">
        <button className="btn small ghost close" onClick={onClose}>Close ✕</button>
        <h2>How ProofPrep works</h2>
        <p className="muted" style={{ marginTop: 6 }}>It helps you show what your resume can honestly prove for one specific job, then practice talking about it.</p>
        <h3>The four steps</h3>
        <ol>{STEPS.map(s => <li key={s.id}><b>{s.label}.</b> {s.job}</li>)}</ol>
        <h3>What the labels mean</h3>
        <div className="legend">{order.map(s => <div key={s}><span className={`chip ${s}`}>{STATUS_LABEL[s]}</span><span>{STATUS_HELP[s]}</span></div>)}</div>
        <h3>Questions</h3>
        {FAQ.map(([q, a]) => <details className="faq" key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </aside>
    </>
  );
}
