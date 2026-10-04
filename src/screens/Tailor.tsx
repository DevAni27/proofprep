import { useState } from 'react';
import { api, workflow, type Application, type Health, type WorkflowStatus } from '../lib/api';
import { go } from '../App';
import { resumeToHtml, RESUME_CSS } from '../lib/resumeHtml';
import { Icon } from '../components/Guide';

interface Proposal { id: string; lineId: string | null; original: string | null; note: string | null; requirement: string; rewritten: string | null; reason: string; ungrounded: string[]; error?: string; model?: string; section?: string | null; sections?: string[]; anchor?: string | null; placement?: { action: 'insert_after' | 'replace'; lineId: string; reason: string } | null; placements?: { id: string; text: string; entry: string | null; section: string | null }[] }
type Version = { id: string; created_at: string; text: string; note: string };

const post = async <T,>(path: string, body?: unknown): Promise<T> => { const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const d = await r.json(); if (!r.ok) throw Error(d.detail ? `${d.error} ${d.detail}` : d.error); return d as T; };

// Word-level diff for the before/after view (simple LCS; bullets are short).
function diffWords(a: string, b: string) {
  const x = a.split(/\s+/), y = b.split(/\s+/);
  const m = x.length, n = y.length; const L: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { t: string; k: 'same' | 'del' | 'add' }[] = []; let i = 0, j = 0;
  while (i < m && j < n) { if (x[i] === y[j]) { out.push({ t: x[i], k: 'same' }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: x[i++], k: 'del' }); else out.push({ t: y[j++], k: 'add' }); }
  while (i < m) out.push({ t: x[i++], k: 'del' }); while (j < n) out.push({ t: y[j++], k: 'add' });
  return out;
}

// Placement value is "after:S12" or "replace:S12"; the default is the model's choice.
const placementValue = (p: Proposal, picked?: string) => picked ?? (p.placement ? `${p.placement.action === 'replace' ? 'replace' : 'after'}:${p.placement.lineId}` : '');
function placementOf(p: Proposal, picked?: string) {
  const v = placementValue(p, picked); if (!v) return { section: p.section ?? null, anchor: p.anchor ?? null };
  const [kind, lineId] = v.split(':'); return { placement: { action: kind === 'replace' ? 'replace' : 'insert_after', lineId } };
}
const clip = (t: string, n = 80) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

export function Tailor({ app, health, onChange, wf, onWorkflow }: { app: Application; health: Health | null; onChange: (a: Application) => void; wf: WorkflowStatus | null; onWorkflow: (w: WorkflowStatus) => void }) {
  const atApprove = wf?.status === 'suspended' && wf.suspended.some(s => s.step === 'approve-edits');
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [place, setPlace] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<Version | null>(app.resumeVersions?.[0] ?? null);
    const decided = Object.values(app.decisions).filter(d => d.verdict === 'accepted' || d.verdict === 'clarified').length;

  const propose = async () => {
    setBusy(true); setErr(null);
    try { const r = await post<{ proposals: Proposal[] }>(`/api/applications/${app.id}/tailor`); setProposals(r.proposals); setChosen(Object.fromEntries(r.proposals.filter(p => p.rewritten && !p.ungrounded.length).map(p => [p.id, true]))); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setErr(null);
    try {
      const accepted = (proposals ?? []).filter(p => chosen[p.id] && p.rewritten).map(p => ({ lineId: p.lineId, rewritten: p.rewritten, ...(p.lineId ? {} : placementOf(p, place[p.id])) }));
      if (atApprove) { const w = await workflow.resume(app.id, 'approve-edits', { accepted }); onWorkflow(w); if (w.status === 'failed') throw Error(w.error || 'Workflow failed.'); }
      else await post<{ version: Version; versions: Version[] }>(`/api/applications/${app.id}/versions`, { accepted, note: `Applied ${accepted.length} approved edit(s)` });
      const fresh = await api.get(app.id); onChange(fresh); setPreview(fresh.resumeVersions?.[0] ?? null); setProposals(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const nChosen = Object.values(chosen).filter(Boolean).length;

  return (
    <>
      {preview && (
        <div className="card">
          <div className="row between">
            <div><h2>Your improved resume</h2><p className="small muted">Saved {new Date(preview.created_at).toLocaleString()} · {preview.note}. Your original is kept.</p></div>
            <div className="row"><button className="btn small" onClick={() => { navigator.clipboard?.writeText(preview.text); }}>Copy text</button><button className="btn primary small" onClick={() => printResume(app.title, preview.text)}>Export PDF</button></div>
          </div>
          <pre className="evidence mono" style={{ whiteSpace: 'pre-wrap', marginTop: 10, marginBottom: 0 }}>{preview.text}</pre>
          {(app.resumeVersions?.length ?? 0) > 1 && <details style={{ marginTop: 8 }}><summary>Earlier versions</summary><div className="list" style={{ marginTop: 6 }}>{app.resumeVersions!.map(v => <div key={v.id} className="row between small"><span>{new Date(v.created_at).toLocaleString()} · {v.note}</span><button className="btn small" onClick={() => setPreview(v)}>View</button></div>)}</div></details>}
        </div>
      )}
      <div className="card">
        <div className="row between">
          <div><h2>Get suggested edits</h2><p className="muted small">Uses the {decided} fact{decided === 1 ? '' : 's'} you approved. Takes a few seconds per line.</p></div>
          <button className="btn primary" disabled={busy || !decided || health?.ollama !== 'connected'} onClick={propose}>{busy && !proposals ? <><span className="spinner" /> Writing suggestions…</> : proposals ? 'Try again' : 'Suggest edits'}</button>
        </div>
        {!decided && <div className="banner warn" style={{ marginTop: 12 }}>Nothing approved yet. Go back to “Check evidence” and approve a card or add context.</div>}
        {err && <div className="banner error" style={{ marginTop: 12 }}>{err}</div>}
      </div>
      {proposals && (
        <>
          {proposals.length === 0 && <div className="card empty">Your approved lines are already strong, so no rewrites were needed. Go ahead to interview practice.</div>}
          {proposals.map(p => (
            <div key={p.id} className={`card ${chosen[p.id] ? 'decided-accepted' : ''}`}>
              <div className="row between"><h3>{p.lineId ? 'Sharper wording' : 'New bullet from your note'} · <span className="muted" style={{ fontWeight: 500 }}>{p.requirement}</span></h3>
                {p.rewritten && <label className="row small" style={{ gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={Boolean(chosen[p.id])} onChange={e => setChosen(c => ({ ...c, [p.id]: e.target.checked }))} /> Use this</label>}
              </div>
              {p.error && <div className="banner error" style={{ marginTop: 8 }}>Couldn’t write this one: {p.error}</div>}
              {p.rewritten && (
                <>
                  <div className="evidence" style={{ marginTop: 8 }}>
                    <div className="src">{p.original ? 'before → after' : `from your note: “${p.note}”`}</div>
                    {p.original ? <p>{diffWords(p.original, p.rewritten).map((w, i) => <span key={i} className={w.k === 'same' ? '' : `df df-${w.k}`}>{w.t} </span>)}</p> : <p>{p.rewritten}</p>}
                  </div>
                  {!p.lineId && p.placements && p.placements.length > 0 && (() => {
                    const v = placementValue(p, place[p.id]); const [kind, lid] = v.split(':'); const target = p.placements!.find(x => x.id === lid);
                    const groups = [...new Set(p.placements!.map(x => x.entry ?? x.section ?? 'Resume'))];
                    return (
                      <div style={{ marginTop: 10 }}>
                        <label className="row small" style={{ gap: 8, alignItems: 'center' }}><b>Where it goes</b>
                          <select value={v} onChange={e => setPlace(x => ({ ...x, [p.id]: e.target.value }))}>
                            <optgroup label="Add as a new bullet after…">{groups.map(g => p.placements!.filter(x => (x.entry ?? x.section ?? 'Resume') === g).map(x => <option key={`a${x.id}`} value={`after:${x.id}`}>{clip(`${g} · ${x.text}`, 90)}</option>))}</optgroup>
                            <optgroup label="Replace this bullet…">{p.placements!.map(x => <option key={`r${x.id}`} value={`replace:${x.id}`}>{clip(x.text, 90)}</option>)}</optgroup>
                          </select>
                        </label>
                        {p.placement?.reason && v === placementValue(p) && <p className="small muted" style={{ marginTop: 4 }}>Why here: {p.placement.reason}</p>}
                        {target && kind === 'after' && <p className="small faint" style={{ marginTop: 4 }}>Appears right after: “{clip(target.text, 110)}”{target.entry ? ` (${target.entry})` : ''}</p>}
                        {target && kind === 'replace' && <div className="evidence" style={{ marginTop: 6 }}><div className="src">replaces → before / after</div><p>{diffWords(target.text, p.rewritten!).map((w, i) => <span key={i} className={w.k === 'same' ? '' : `df df-${w.k}`}>{w.t} </span>)}</p></div>}
                      </div>
                    );
                  })()}
                  <p className="small muted" style={{ marginTop: 6 }}>{p.reason}</p>
                  {p.ungrounded.length > 0 && <div className="banner warn" style={{ marginTop: 8 }}><span><strong>Check this detail:</strong> the new wording adds {p.ungrounded.join(', ')}, which isn’t in what you approved. Keep it only if it’s true.</span></div>}
                </>
              )}
            </div>
          ))}
          {proposals.some(p => p.rewritten) && (
            <div className="card">
              <div className="row between"><div><h3>Save {nChosen} edit{nChosen === 1 ? '' : 's'}</h3><p className="small muted">Creates a new version of your resume. The original is kept.</p></div><button className="btn primary" disabled={busy || !nChosen} onClick={apply}>{busy ? <span className="spinner" /> : null} Save these edits</button></div>
            </div>
          )}
        </>
      )}
      <div className="nextbar">
        <div><h3>Ready to practice?</h3><p className="small muted">Interview questions come from the same facts you approved.</p></div>
        <button className="btn primary big" disabled={busy} onClick={async () => { if (atApprove) { try { const w = await workflow.resume(app.id, 'approve-edits', { accepted: [], skip: true }); onWorkflow(w); onChange(await api.get(app.id)); } catch (e) { setErr((e as Error).message); return; } } go(`#/app/${app.id}/practice`); }}>{atApprove ? 'Skip edits and practice' : 'Go to practice'} <Icon name="arrow" size={18} /></button>
      </div>
    </>
  );
}

// Print-to-PDF: opens a clean, print-styled window with the approved text (layout only; the words are not changed).
export function printResume(title: string, text: string) {
  const esc = (x: string) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const w = window.open('', '_blank', 'width=900,height=1100'); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${RESUME_CSS}</style></head><body><div class="bar"><button onclick="window.print()">Save as PDF</button><span>In the print window choose “Save as PDF” as the destination. Turn off “Headers and footers” for the cleanest result.</span></div>${resumeToHtml(text)}</body></html>`);
  w.document.close();
}
