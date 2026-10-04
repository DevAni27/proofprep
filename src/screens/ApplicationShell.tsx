import { useCallback, useEffect, useState } from 'react';
import { api, workflow, type Application, type Health, type WorkflowStatus } from '../lib/api';
import { Icon, StepGuide, Stepper, type Tab } from '../components/Guide';
import { go } from '../App';
import { InputsForm } from './Inputs';
import { Review } from './Review';
import { Practice } from './Practice';
import { Tailor } from './Tailor';

const STAGES = ['Reading the job post and listing what it asks for', 'Searching your resume for each requirement', 'Checking every quote against your resume'];

function Working({ elapsed }: { elapsed: number }) {
  const now = Math.min(STAGES.length - 1, Math.floor(elapsed / 45));
  return (
    <div className="card working">
      <div className="orb"><Icon name="search" size={28} /></div>
      <h2>Finding your evidence…</h2>
      <p className="muted" style={{ marginTop: 6 }}>This usually takes one to four minutes. Keep this tab open. You can read the next steps in the meantime.</p>
      <div className="stages">{STAGES.map((t, i) => <div key={t} className={`stage ${i < now ? 'done' : i === now ? 'now' : ''}`}><span className="si">{i < now ? <Icon name="check" size={13} /> : null}</span>{t}</div>)}</div>
      <div className="progress live" style={{ maxWidth: 460, margin: '20px auto 0' }}><div style={{ width: `${Math.min(92, 8 + elapsed * 0.6)}%` }} /></div>
      <p className="small faint" style={{ marginTop: 8 }}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} elapsed</p>
    </div>
  );
}

export function ApplicationShell({ id, tab, health }: { id: string; tab?: Tab; health: Health | null }) {
  const [app, setApp] = useState<Application | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [wf, setWf] = useState<WorkflowStatus | null>(null);
  const refreshWf = useCallback(() => workflow.status(id).then(setWf).catch(() => setWf(null)), [id]);
  const reload = useCallback(() => api.get(id).then(a => { setApp(a); setError(null); }).catch(e => setError(e.message)), [id]);
  useEffect(() => { reload(); refreshWf(); }, [reload, refreshWf]);
  useEffect(() => { if (!analyzing) return; const s = Date.now(); const t = setInterval(() => setElapsed(Math.round((Date.now() - s) / 1000)), 500); return () => clearInterval(t); }, [analyzing]);
  const active: Tab = tab ?? (app?.analysis ? 'review' : 'inputs');

  const analyze = async () => {
    setAnalyzing(true); setError(null); setElapsed(0); go(`#/app/${id}/inputs`);
    try { const r = await workflow.start(id); setWf(r); if (r.status === 'failed') throw Error(r.error || 'Workflow failed.'); await reload(); go(`#/app/${id}/review`); }
    catch (e) { const err = e as { message: string; detail?: string }; setError(err.detail ? `${err.message} ${err.detail}` : err.message); }
    finally { setAnalyzing(false); }
  };

  if (error && !app) return <main className="page"><div className="banner error">{error}</div></main>;
  if (!app) return <main className="page"><span className="spinner" /></main>;
  const unlocked = (t: Tab) => t === 'inputs' || Boolean(app.analysis);
  const done: Record<Tab, boolean> = { inputs: Boolean(app.analysis), review: app.stage === 'tailor' || app.stage === 'practice' || wf?.status === 'success', tailor: (app.resumeVersions?.length ?? 0) > 0 || app.stage === 'practice', practice: (app.sessions?.length ?? 0) > 0 };
  return (
    <main className="page">
      <div className="page-head">
        <div><a className="small" href="#/applications" style={{ textDecoration: 'none' }}>← All applications</a><h1 style={{ marginTop: 4 }}>{app.title}</h1></div>
        <button className="btn ghost small danger" onClick={async () => { if (confirm('Delete this application and everything saved for it?')) { await api.remove(id); go('#/applications'); } }}>Delete</button>
      </div>
      <Stepper active={active} done={done} unlocked={unlocked} onGo={t => go(`#/app/${id}/${t}`)} />
      <StepGuide step={active} />
      {active === 'inputs' && (
        <>
          <InputsForm app={app} health={health} onSaved={(a) => { setApp(a); }} />
          {analyzing ? <div style={{ marginTop: 14 }}><Working elapsed={elapsed} /></div> : (
            <div className="nextbar">
              <div><h3>{app.analysis ? 'Run the evidence check again' : 'Ready? Let’s find your evidence'}</h3><p className="small muted">{app.analysis ? 'Starting over replaces the current results and clears your approvals.' : 'ProofPrep lists what the job asks for and finds the matching lines on your resume. Save your details above first if you changed anything.'}</p></div>
              <button className="btn primary big" disabled={health?.ollama !== 'connected'} onClick={analyze}>{app.analysis ? 'Start over' : 'Find my evidence'} <Icon name="arrow" size={18} /></button>
            </div>
          )}
          {health?.ollama !== 'connected' && !analyzing && <div className="banner warn" style={{ marginTop: 12 }}>The analysis engine isn’t running yet. Start it and this button will unlock.</div>}
          {error && <div className="banner error" style={{ marginTop: 12 }}>{error}</div>}
        </>
      )}
      {active === 'review' && app.analysis && <Review app={app} onChange={setApp} onReanalyze={() => go(`#/app/${id}/inputs`)} analyzing={analyzing} wf={wf} onWorkflow={setWf} />}
      {active === 'review' && !app.analysis && <div className="card empty">Add your details and press “Find my evidence” first.</div>}
      {active === 'practice' && app.analysis && <Practice app={app} health={health} />}
      {active === 'tailor' && app.analysis && <Tailor app={app} health={health} onChange={setApp} wf={wf} onWorkflow={setWf} />}
      {active === 'tailor' && !app.analysis && <div className="card empty">Add your details and press “Find my evidence” first.</div>}
    </main>
  );
}
