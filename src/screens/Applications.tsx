import { useEffect, useState } from 'react';
import { api, type AppSummary, type Health } from '../lib/api';
import { go } from '../App';
import { InputsForm } from './Inputs';
import { Icon } from '../components/Guide';

const STAGE_LABEL = { inputs: 'Ready to analyze', review: 'Checking evidence', tailor: 'Improving resume', practice: 'Practicing interviews' } as const;
const HOW = [
  { icon: 'upload', tag: 'Step 1', title: 'Add your details', text: 'Upload your resume and paste the job post. Takes about a minute.' },
  { icon: 'search', tag: 'Step 2', title: 'Check the evidence', text: 'See which resume lines back up each requirement. You approve or reject every one.' },
  { icon: 'edit', tag: 'Step 3', title: 'Improve your resume', text: 'Get sharper wording built only from facts you approved. Export as PDF.' },
  { icon: 'mic', tag: 'Step 4', title: 'Practice the interview', text: 'Answer questions about your own experience and get feedback on each answer.' },
] as const;

export function Applications({ health, newApp }: { health: Health | null; newApp: boolean }) {
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.list().then(setApps).catch(e => setError(e.message));
  useEffect(() => { load(); }, [newApp]);

  if (newApp) {
    return (
      <main className="page">
        <div className="page-head"><div><h1>New application</h1><p className="muted">Add your resume and the job post. You’ll check the text before anything is analyzed.</p></div><button className="btn ghost" onClick={() => go('#/applications')}>Cancel</button></div>
        <InputsForm health={health} onSaved={(app) => go(`#/app/${app.id}/inputs`)} />
      </main>
    );
  }
  const first = apps !== null && apps.length === 0;
  return (
    <main className="page">
      <div className="page-head">
        <div><h1>Your applications</h1><p className="muted">{first ? 'Start with a resume and a job post. You’ll review every suggestion before anything is used.' : 'Pick up where you left off, or start a new one for another job.'}</p></div>
        <div className="row"><a className="btn ghost" href="#/">Home</a><button className="btn primary" onClick={() => go('#/new')}>{first ? 'Start your first application' : 'New application'} <Icon name="arrow" size={18} /></button></div>
      </div>
      {first && <div className="how">{HOW.map((h, i) => <div key={h.title} className="how-card" style={{ ['--i' as string]: i }}><div className="ico"><Icon name={h.icon} size={22} /></div><span className="tag">{h.tag}</span><h3>{h.title}</h3><p>{h.text}</p></div>)}</div>}
      {error && <div className="banner error">Could not load applications: {error}</div>}
      {apps && apps.length > 0 && (
        <div className="list">
          {apps.map((a, i) => (
            <a key={a.id} className="card lift app-row" style={{ ['--i' as string]: i }} href={`#/app/${a.id}/${a.analyzed ? (a.stage === 'inputs' ? 'review' : a.stage) : 'inputs'}`}>
              <div style={{ flex: 1 }}><div className="title">{a.title}</div><div className="meta">{STAGE_LABEL[a.stage]} · updated {new Date(a.updated_at).toLocaleString()}</div></div>
              <span className={`chip ${a.analyzed ? 'supported' : 'not_evidenced'}`}>{a.analyzed ? `${a.decided} reviewed` : 'Not analyzed yet'}</span>
              <span className="arrow"><Icon name="arrow" size={18} /></span>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
