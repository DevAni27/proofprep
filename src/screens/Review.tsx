import { useMemo, useState } from 'react';
import { api, workflow, STATUS_HELP, STATUS_LABEL, type Application, type Decision, type Requirement, type Status, type WorkflowStatus } from '../lib/api';
import { go } from '../App';
import { Icon } from '../components/Guide';

const ORDER: Status[] = ['requires_confirmation', 'supported', 'partially_supported', 'not_evidenced', 'unverified'];

// Highlights the quoted words inside the cited resume line (the backend already verified they occur).
function Highlighted({ text, quote }: { text: string; quote: string }) {
  const q = quote.replace(/^Cited resume text: [“"]?/, '').replace(/[”"]$/, '').trim();
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function RequirementCard({ r, decision, onDecide }: { r: Requirement; decision?: Decision; onDecide: (d: Decision | null) => void }) {
  const [note, setNote] = useState(decision?.note ?? '');
  const [noting, setNoting] = useState(decision?.verdict === 'clarified');
  const cls = decision ? `decided-${decision.verdict}` : '';
  return (
    <div className={`card req ${cls}`}>
      <div className="req-head">
        <div><div className="req-title">{r.requirement}</div><div className="jd-quote">“{r.jobQuote}”</div></div>
        <span className={`chip ${r.status}`} title={STATUS_HELP[r.status]}>{STATUS_LABEL[r.status]}</span>
      </div>
      {r.evidence.length > 0 && r.evidence.map(s => <div className="evidence" key={s.id}><div className="src">{s.id}</div><Highlighted text={s.text} quote={r.explanation} /></div>)}
      {r.status === 'partially_supported' && r.missingEvidence && <p className="missing"><b>Not shown on the resume:</b> {r.missingEvidence}</p>}
      {r.status === 'not_evidenced' && <p className="missing">{STATUS_HELP.not_evidenced}</p>}
      {r.status === 'unverified' && <p className="missing">{STATUS_HELP.unverified}</p>}
            {r.status === 'requires_confirmation' ? (
        <div className="decide">
          <span className="small muted" style={{ marginRight: 4 }}>{r.confirmationPrompt}</span>
          <button className={`btn small ${decision?.answer === 'yes' ? 'selected' : ''}`} onClick={() => onDecide({ verdict: 'accepted', answer: 'yes' })}>Yes, I can</button>
          <button className={`btn small ${decision?.answer === 'no' ? 'selected reject' : ''}`} onClick={() => onDecide({ verdict: 'rejected', answer: 'no' })}>No</button>
        </div>
      ) : (
        <div className="decide">
          <span className="decide-label">Your call:</span>
          {r.evidence.length > 0 && <button className={`btn small ${decision?.verdict === 'accepted' ? 'selected' : ''}`} onClick={() => onDecide({ verdict: 'accepted' })} title="The highlighted words really show this.">Yes, this proves it</button>}
          <button className={`btn small ${decision?.verdict === 'rejected' ? 'selected reject' : ''}`} onClick={() => onDecide({ verdict: 'rejected' })} title={r.evidence.length ? 'This line does not really show it.' : 'I do not have this; leave it as a gap.'}>{r.evidence.length ? 'Not really' : 'I don’t have this'}</button>
          <button className={`btn small ${decision?.verdict === 'clarified' ? 'selected' : ''}`} onClick={() => setNoting(v => !v)} title="Add a fact in your own words that the resume does not state. It becomes an approved fact for your resume edits and interview practice.">{r.evidence.length ? 'Add context' : 'I do have this'}</button>
          {decision && <button className="btn small ghost" onClick={() => { onDecide(null); setNoting(false); }}>Undo</button>}
        </div>
      )}
      {noting && (
        <div className="note">
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="In your own words, what did you actually do? For example: “Built the REST API and PostgreSQL schema for our college events app.” Only include things you could talk about in an interview." />
          <div className="actions" style={{ marginTop: 8 }}><button className="btn small ghost" onClick={() => setNoting(false)}>Cancel</button><button className="btn small primary" disabled={note.trim().length < 10} onClick={() => { onDecide({ verdict: 'clarified', note: note.trim() }); setNoting(false); }}>Save this fact</button></div>
        </div>
      )}
    </div>
  );
}

export function Review({ app, onChange, onReanalyze, analyzing, wf, onWorkflow }: { app: Application; onChange: (a: Application) => void; onReanalyze: () => void; analyzing: boolean; wf: WorkflowStatus | null; onWorkflow: (w: WorkflowStatus) => void }) {
  const [proceeding, setProceeding] = useState(false);
  const analysis = app.analysis!;
  const reqs = analysis.analysis.requirements;
  const [filter, setFilter] = useState<Status | 'all' | 'undecided'>('all');
  const [saveError, setSaveError] = useState<string | null>(null);
  const counts = useMemo(() => Object.fromEntries(ORDER.map(s => [s, reqs.filter(r => r.status === s).length])) as Record<Status, number>, [reqs]);
  const decided = Object.keys(app.decisions).length;
  const shown = reqs.filter(r => filter === 'all' ? true : filter === 'undecided' ? !app.decisions[r.id] : r.status === filter).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));

  const decide = async (id: string, d: Decision | null) => {
    const decisions = { ...app.decisions }; if (d) decisions[id] = d; else delete decisions[id];
    onChange({ ...app, decisions });
    try { await api.patch(app.id, { decisions }); setSaveError(null); } catch (e) { setSaveError((e as Error).message); }
  };
  const conditions = reqs.filter(r => r.status === 'requires_confirmation');
  const unanswered = conditions.filter(r => !app.decisions[r.id]);
  // Resumes the Mastra run through its human steps with the decisions made on this screen.
  const proceed = async () => {
    setProceeding(true); setSaveError(null);
    try {
      let w = wf ?? await workflow.status(app.id);
      if (w.status === 'not_started') w = await workflow.start(app.id);
      const at = (step: string) => w.status === 'suspended' && w.suspended.some(s => s.step === step);
      if (at('confirm-conditions')) {
        if (unanswered.length) throw Error(`Answer the ${unanswered.length} condition question${unanswered.length === 1 ? '' : 's'} first (Yes or No).`);
        w = await workflow.resume(app.id, 'confirm-conditions', { answers: Object.fromEntries(conditions.map(r => [r.id, app.decisions[r.id].answer])) });
      }
      if (at('review-evidence')) {
        const skillDecisions = Object.fromEntries(Object.entries(app.decisions).filter(([id]) => !conditions.some(c => c.id === id)));
        w = await workflow.resume(app.id, 'review-evidence', { decisions: skillDecisions });
      }
      onWorkflow(w);
      if (w.status === 'failed') throw Error(w.error || 'Workflow failed.');
      onChange(await api.get(app.id)); go(`#/app/${app.id}/tailor`);
    } catch (e) { setSaveError((e as Error).message); } finally { setProceeding(false); }
  };

  return (
    <>
      <div className="card">
        <div className="summary">
          {ORDER.filter(s => counts[s] > 0).map(s => <div className="stat" key={s}><div className="n">{counts[s]}</div><div className="l">{STATUS_LABEL[s]}</div></div>)}
          <div className="stat"><div className="n">{decided}/{reqs.length}</div><div className="l">Reviewed by you</div></div>
        </div>
        <div className="progress" style={{ marginTop: 12 }}><div style={{ width: `${reqs.length ? (100 * decided) / reqs.length : 0}%` }} /></div>
        <div className="row between" style={{ marginTop: 12 }}>
          <div className="filters">
            <button className={`btn small ${filter === 'all' ? 'selected' : ''}`} onClick={() => setFilter('all')}>All</button>
            <button className={`btn small ${filter === 'undecided' ? 'selected' : ''}`} onClick={() => setFilter('undecided')}>To review ({reqs.length - decided})</button>
            {ORDER.filter(s => counts[s]).map(s => <button key={s} className={`btn small ${filter === s ? 'selected' : ''}`} onClick={() => setFilter(s)}>{STATUS_LABEL[s]}</button>)}
          </div>
          <details><summary>Details</summary>
            <p className="small muted" style={{ marginTop: 6 }}>{reqs.length} requirements · {(analysis.metrics.elapsedMs / 1000).toFixed(0)}s to analyze</p>
            <button className="btn small" style={{ marginTop: 8 }} disabled={analyzing} onClick={onReanalyze}>Start the evidence check over (clears approvals)</button>
          </details>
        </div>
      </div>
      {saveError && <div className="banner error" style={{ marginTop: 12 }}>{saveError}</div>}
      <div style={{ marginTop: 14 }}>
        {shown.length === 0 && <div className="card empty">Nothing in this filter.</div>}
        {shown.map(r => <RequirementCard key={r.id} r={r} decision={app.decisions[r.id]} onDecide={d => decide(r.id, d)} />)}
      </div>
      <div className="nextbar">
        <div><h3>{decided === 0 ? 'Review at least one card to continue' : 'Done reviewing? Move on to your resume'}</h3><p className="small muted">{reqs.length - decided > 0 ? `${reqs.length - decided} still to review. Anything you skip is left out, and that’s fine.` : 'Everything is reviewed.'} Only what you approved is used from here on.</p></div>
        <button className="btn primary big" disabled={decided === 0 || proceeding} onClick={proceed}>{proceeding ? <span className="spinner" /> : null} Continue <Icon name="arrow" size={18} /></button>
      </div>
    </>
  );
}
