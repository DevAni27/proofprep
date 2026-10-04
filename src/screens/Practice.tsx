import { useEffect, useState } from 'react';
import { api, type Application, type Health } from '../lib/api';

interface Turn { n: number; question: string; probes: string; basedOn: string; answer: string | null; followUpOf?: number; feedback: { strengths: string; gaps: string; suggestion: string; followUp: string; model: string } | null }
interface Session { id: string; created_at: string; focus: { text: string; requirement: string } | null; turns: Turn[]; model?: string }

const sessionApi = {
  start: (appId: string, focus?: string) => fetch(`/api/applications/${appId}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(focus ? { focus } : {}) }).then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.detail ? `${d.error} ${d.detail}` : d.error); return d as Session; }),
  get: (id: string) => fetch(`/api/sessions/${id}`).then(r => r.json() as Promise<Session>),
  answer: (id: string, n: number, answer: string) => fetch(`/api/sessions/${id}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n, answer }) }).then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.detail ? `${d.error} ${d.detail}` : d.error); return d as Session; }),
};

// Approved facts, mirrored from the server's rule: accepted evidence, confirmed conditions, own notes.
function approvedFacts(app: Application) {
  const out: { requirement: string; text: string; source: 'resume' | 'note' | 'confirmed' }[] = [];
  for (const r of app.analysis?.analysis.requirements ?? []) {
    const d = app.decisions[r.id]; if (!d) continue;
    if (d.verdict === 'accepted' && r.evidence.length) out.push({ requirement: r.requirement, text: r.evidence.map(e => e.text).join(' '), source: 'resume' });
    else if (d.verdict === 'accepted' && r.status === 'requires_confirmation') out.push({ requirement: r.requirement, text: `Confirmed by candidate: ${r.requirement}`, source: 'confirmed' });
    if (d.verdict === 'clarified' && d.note) out.push({ requirement: r.requirement, text: d.note, source: 'note' });
  }
  return out;
}

function TurnCard({ turn, sessionId, onUpdate, busy, setBusy }: { turn: Turn; sessionId: string; onUpdate: (s: Session) => void; busy: boolean; setBusy: (b: boolean) => void }) {
  const [draft, setDraft] = useState(''); const [err, setErr] = useState<string | null>(null); const [sending, setSending] = useState(false);
  const submit = async () => {
    setSending(true); setBusy(true); setErr(null);
    try { onUpdate(await sessionApi.answer(sessionId, turn.n, draft)); } catch (e) { setErr((e as Error).message); } finally { setSending(false); setBusy(false); }
  };
  return (
    <div className={`card ${turn.feedback ? 'decided-accepted' : ''}`}>
      <div className="row between"><h3>{turn.followUpOf ? `Follow-up to Q${turn.followUpOf}` : `Question ${turn.n}`}</h3><span className="small faint">based on: “{turn.basedOn.slice(0, 90)}{turn.basedOn.length > 90 ? '…' : ''}”</span></div>
      <p style={{ fontSize: 16, marginTop: 6 }}>{turn.question}</p>
      {turn.answer ? (
        <>
          <div className="evidence" style={{ marginTop: 10 }}><div className="src">your answer</div>{turn.answer}</div>
          {turn.feedback && (
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <p><b>What worked well:</b> {turn.feedback.strengths}</p>
              <p><b>What an interviewer may still want:</b> {turn.feedback.gaps}</p>
              <p><b>Try this next time:</b> {turn.feedback.suggestion}</p>
            </div>
          )}
        </>
      ) : (
        <div className="note">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Say it out loud first, then type what you said. Specific beats polished." disabled={busy} />
          <div className="row between" style={{ marginTop: 8 }}>
            <details><summary>What a strong answer covers</summary><p className="small muted" style={{ marginTop: 4 }}>{turn.probes}</p></details>
            <button className="btn primary small" disabled={busy || draft.trim().length < 5} onClick={submit}>{sending ? <><span className="spinner" /> Reading your answer…</> : 'Get feedback'}</button>
          </div>
          {err && <div className="banner error" style={{ marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

export function Practice({ app, health }: { app: Application; health: Health | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const facts = approvedFacts(app);
  const past = app.sessions ?? [];
  const model = health?.roles.find(r => r.role === 'interview');
  useEffect(() => { setSession(null); }, [app.id]);
  const start = async (focus?: string) => {
    setStarting(true); setErr(null);
    try { setSession(await sessionApi.start(app.id, focus)); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { setErr((e as Error).message); } finally { setStarting(false); }
  };
  return (
    <>
      {session ? (
        <>
          <div className="row between" style={{ marginBottom: 12 }}>
            <div><h2>{session.focus ? 'Practicing one bullet' : 'Mock interview'}</h2>{session.focus && <p className="small muted">“{session.focus.text}”</p>}</div>
            <button className="btn small" onClick={() => setSession(null)}>Back to setup</button>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>{session.turns.map(t => <TurnCard key={t.n} turn={t} sessionId={session.id} onUpdate={setSession} busy={busy} setBusy={setBusy} />)}</div>
          {session.turns.every(t => t.answer) && <div className="card" style={{ marginTop: 12 }}><div className="row between"><div><h3>Nice work. Session complete</h3><p className="small muted">It’s saved. Start another, or drill a bullet that felt weak.</p></div><button className="btn primary" onClick={() => setSession(null)}>Start another</button></div></div>}
        </>
      ) : (
        <>
          <div className="card">
            <div className="row between">
              <div><h2>Mock interview</h2><p className="muted small">Three questions drawn from your approved facts, favoring what the job asks for. Each answer gets feedback and a follow-up.</p></div>
              <button className="btn primary big" disabled={starting || !facts.length || !model?.available} onClick={() => start()}>{starting ? <><span className="spinner" /> Preparing questions…</> : 'Start interview'}</button>
            </div>
            {!facts.length && <div className="banner warn" style={{ marginTop: 12 }}>Nothing approved yet. Go back to “Check evidence” and approve a card or add context. Questions only come from facts you’ve signed off.</div>}
            {model && !model.available && <div className="banner warn" style={{ marginTop: 12 }}>The interview model isn’t installed yet. Run <span className="kbd">ollama pull {model.model}</span> and refresh.</div>}
            {err && <div className="banner error" style={{ marginTop: 12 }}>{err}</div>}
          </div>
          <div className="card">
            <h2>Or drill one bullet</h2>
            <p className="muted small">Pick one approved fact and get three questions that probe it from different angles.</p>
            <div className="list" style={{ marginTop: 10 }}>
              {facts.map((f, i) => (
                <div key={i} className="row between evidence">
                  <div><div className="src">{f.source === 'note' ? 'your note' : f.source === 'confirmed' ? 'confirmed' : 'resume'} · {f.requirement}</div>{f.text}</div>
                  <button className="btn small" disabled={starting || !model?.available} onClick={() => start(f.text)}>Practice</button>
                </div>
              ))}
            </div>
          </div>
          {past.length > 0 && (
            <div className="card">
              <h2>Past sessions</h2>
              <div className="list" style={{ marginTop: 10 }}>
                {past.map(s => <div key={s.id} className="row between"><span className="small">{new Date(s.created_at).toLocaleString()} · {s.turns} question{s.turns === 1 ? '' : 's'}{s.focus ? ' · focused' : ''}</span><button className="btn small" onClick={() => sessionApi.get(s.id).then(setSession)}>Open</button></div>)}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
