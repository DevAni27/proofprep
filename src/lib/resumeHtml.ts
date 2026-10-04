// Turns plain resume text into a clean, print-ready layout. The text is never changed, only styled:
// name and contact header, section headings with rules, entry titles with right-aligned dates, bullets,
// "Label: items" skills rows and a muted tech line. Works on extracted PDFs, DOCX and pasted text.
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const BULLET = /^[•●▪\-*]\s*/;
const isHeading = (l: string) => l.length <= 40 && /[A-Z]/.test(l) && l === l.toUpperCase() && !BULLET.test(l);
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const RANGE = new RegExp(`\\(?\\s*(${DATE}\\s*[\\u2013\\u2014-]\\s*(?:Present|Current|${DATE}))\\s*\\)?\\s*$`, 'i');
const CONTACT = /@|https?:\/\/|\+\d|\b(?:LinkedIn|GitHub|Portfolio)\b.*\|/i;
const TECH = /^(built using|tech(?:nologies)?|tools|stack|built with)\s*:/i;
const LINKWORDS = /\s+(GitHub|LinkedIn|Badge|Demo|Live|Website)$/;

function inline(text: string) {
  // Keep trailing link labels (GitHub, LinkedIn) as light, separate text so titles stay clean.
  const m = text.match(LINKWORDS);
  return m ? `${esc(text.slice(0, m.index))}<span class="link">${esc(m[1])}</span>` : esc(text);
}

// Resumes extracted by older versions, or pasted from a PDF, have one bullet split over several lines. Rejoin them so a
// wrapped fragment is never mistaken for a title: a line continues the previous one when it starts in lowercase, starts
// with a digit after an unfinished bullet, or the previous line stopped mid-phrase (comma, hyphen, "and", a month...).
const MID = /(?:[,;(&\u2013-]|\b(?:and|or|of|with|to|for|in|on|the|a|an|using|by|from|at)|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\d(?:st|nd|rd|th))$/i;
const TECH_LINE = /^[\u2022\-*]?\s*(built\s+(using|with)|tech(?:nologies)?|tools|stack)\s*:/i;
function joinWrapped(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const continues = prev !== undefined && !isHeading(line) && !isHeading(prev) && !BULLET.test(line) &&
      (/^[a-z]/.test(line) || /^\d{4}\)/.test(line) || (/^\d/.test(line) && BULLET.test(prev) && !/[.!?]$/.test(prev)) || MID.test(prev) ||
        // a sentence-ending fragment right after an unfinished bullet (titles never end with a full stop)
        (BULLET.test(prev) && !TECH_LINE.test(prev) && !/[.!?:)]$/.test(prev) && /[.!?]$/.test(line) && !/^\(/.test(line)));
    if (!continues) { out.push(line); continue; }
    out[out.length - 1] = /[-\u2013]$/.test(prev) && /^[a-z]/.test(line) ? prev + line : `${prev} ${line}`;
  }
  return out;
}

export function resumeToHtml(text: string): string {
  const raw = joinWrapped(text.split(/\r?\n/).map(l => l.trim()).filter(Boolean));
  if (!raw.length) return '';
  let html = ''; let i = 0;
  // Header: name, then everything up to the first section heading.
  const first = raw[0];
  if (!isHeading(first) || first.length <= 40) { html += `<h1>${esc(first)}</h1>`; i = 1; }
  const head: string[] = [];
  while (i < raw.length && !isHeading(raw[i]) && !BULLET.test(raw[i]) && head.length < 5 && (CONTACT.test(raw[i]) || raw[i].length <= 60 || /^[A-Za-z]+( \| [A-Za-z]+)+$/.test(raw[i]))) head.push(raw[i++]);
  for (const h of head) html += CONTACT.test(h) || /\|/.test(h) ? `<p class="contact">${esc(h)}</p>` : `<p class="tagline">${esc(h)}</p>`;

  let open = false; let list = false; let sectionTitle = '';
  const closeList = () => { if (list) { html += '</ul>'; list = false; } };
  const openSection = (title: string) => { flushSummary(); closeList(); if (open) html += '</section>'; html += `<section><h2>${esc(title)}</h2>`; open = true; sectionTitle = title; };
  const li = (t: string) => { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(t)}</li>`; };

  let summary: string[] = [];
  const flushSummary = () => { if (summary.length) { html += `<p class="para">${esc(summary.join(' '))}</p>`; summary = []; } };
  let pendingRun = ''; // non-bullet text containing inline " • " separators (e.g. a volunteering line)
  const flushRun = () => { if (!pendingRun) return; for (const part of pendingRun.split(/\s*•\s*/).map(s => s.trim()).filter(Boolean)) li(part); pendingRun = ''; };

  const body = raw.slice(i);
  for (let k = 0; k < body.length; k++) {
    const l = body[k];
    if (isHeading(l)) { flushRun(); openSection(l); continue; }
    if (!open) openSection('Summary');
    if (pendingRun || (!BULLET.test(l) && l.includes(' • '))) { pendingRun += (pendingRun ? ' ' : '') + l; continue; }
    if (BULLET.test(l)) {
      const t = l.replace(BULLET, '');
      const skillRow = /skill|tool|technolog|language|stack/i.test(sectionTitle) ? t.match(/^([A-Za-z&/ -]{2,28}):\s+(.+)$/) : null;
      if (skillRow) { closeList(); html += `<p class="kv"><b>${esc(skillRow[1])}:</b> ${esc(skillRow[2])}</p>`; }
      else if (TECH.test(t)) { closeList(); const [label, ...rest] = t.split(':'); html += `<p class="tech"><b>${esc(label)}:</b> ${esc(rest.join(':').trim())}</p>`; }
      else li(t);
      continue;
    }
    closeList();
    if (/summary|profile|objective|about/i.test(sectionTitle)) { summary.push(l); if (/[.!?]$/.test(l)) { html += `<p class="para">${esc(summary.join(' '))}</p>`; summary = []; } continue; }
    // "(1st Place ...)" lines are a subtitle under the entry above.
    if (/^\(.*\)$/.test(l)) { html += `<p class="sub">${esc(l.slice(1, -1))}</p>`; continue; }
    // "Label: a, b, c" skills rows (short label before the colon).
    const kv = l.match(/^([A-Za-z&/ ]{2,28}):\s+(.+)$/);
    if (kv && !/@|http/.test(l) && /skill|tool|technolog|language|stack|interest/i.test(sectionTitle)) { html += `<p class="kv"><b>${esc(kv[1])}:</b> ${esc(kv[2])}</p>`; continue; }
    const dm = l.match(RANGE);
    if (dm && dm.index! > 2) { const title = l.slice(0, dm.index).replace(/[\s|,(]+$/, ''); html += `<div class="entry"><span class="t">${inline(title)}</span><span class="d">${esc(dm[1].replace(/\s*[–—-]\s*/, ' – '))}</span></div>`; continue; }
    // Short non-bullet lines read as entry titles; longer ones as paragraphs.
    html += l.length <= 110 && !/[.!?]$/.test(l) ? `<div class="entry"><span class="t">${inline(l)}</span></div>` : `<p class="para">${esc(l)}</p>`;
  }
  flushSummary(); flushRun(); closeList(); if (open) html += '</section>';
  return html;
}

export const RESUME_CSS = `
  @page { size: A4; margin: 14mm 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font: 10pt/1.42 "Segoe UI", Calibri, "Helvetica Neue", Arial, sans-serif; color: #1b2320; max-width: 760px; margin: 64px auto 32px; padding: 0 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 24pt; line-height: 1.1; font-weight: 700; letter-spacing: .01em; margin: 0 0 3px; color: #0b3a35; text-align: center; }
  .tagline { text-align: center; font-size: 11pt; color: #3e4a45; margin: 0 0 3px; }
  .contact { text-align: center; font-size: 9pt; color: #55625b; margin: 0 0 2px; }
  section { margin-top: 13px; }
  h2 { font-size: 9.5pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #0f766e; border-bottom: 1.2px solid #0f766e; padding-bottom: 2px; margin: 0 0 7px; break-after: avoid; }
  .entry { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-top: 8px; break-after: avoid; }
  .entry:first-of-type { margin-top: 0; }
  .entry .t { font-weight: 650; font-size: 10.5pt; color: #111b17; }
  .entry .d { font-size: 9pt; color: #55625b; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .link { font-weight: 500; font-size: 8.5pt; color: #0f766e; margin-left: 8px; letter-spacing: .02em; }
  .sub { font-size: 9pt; font-style: italic; color: #55625b; margin: 1px 0 3px; }
  ul { margin: 3px 0 2px; padding-left: 15px; }
  li { margin: 0 0 2.5px; padding-left: 2px; }
  li::marker { color: #0f766e; }
  .tech { font-size: 8.8pt; color: #55625b; margin: 3px 0 0; }
  .tech b { color: #3e4a45; font-weight: 600; }
  .kv { margin: 0 0 3px; } .kv b { font-weight: 650; color: #111b17; }
  .para { margin: 0 0 4px; }
  li, .para, .entry { break-inside: avoid; }
  .bar { position: fixed; top: 0; left: 0; right: 0; background: #0f766e; color: #fff; padding: 10px 18px; font: 13px "Segoe UI", Arial, sans-serif; display: flex; gap: 14px; align-items: center; z-index: 10; }
  .bar button { font: inherit; padding: 6px 14px; border-radius: 8px; border: 0; background: #fff; color: #0b4f49; font-weight: 700; cursor: pointer; }
  @media print { .bar { display: none; } body { margin: 0; max-width: none; padding: 0; } }
`;
