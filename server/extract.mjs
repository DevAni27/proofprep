// Document text extraction: PDF via pdf.js, DOCX via mammoth (raw text). Both run locally.
// Extracted text is shown to the user for correction before any model sees it.
export async function extractText({ name = '', mime = '', base64 }) {
  if (typeof base64 !== 'string' || !base64) throw Error('No file content supplied.');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 8 * 1024 * 1024) throw Error('Files over 8 MB are not supported.');
  const lower = name.toLowerCase();
  const isPdf = mime === 'application/pdf' || lower.endsWith('.pdf') || buffer.subarray(0, 5).toString() === '%PDF-';
  const isDocx = lower.endsWith('.docx') || mime.includes('wordprocessingml');
  if (isPdf) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      // Rebuild lines from text items using their y position; pdf.js gives fragments, not lines.
      let line = []; let lastY = null; const lines = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = Math.round(item.transform[5]);
        if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line.join('')); line = []; }
        line.push(item.str + (item.hasEOL ? '' : ''));
        if (item.hasEOL) { lines.push(line.join('')); line = []; lastY = null; } else lastY = y;
      }
      if (line.length) lines.push(line.join(''));
      pages.push(lines.map(l => l.trim()).filter(Boolean).join('\n'));
    }
    return { text: tidy(pages.join('\n')), pages: doc.numPages, kind: 'pdf' };
  }
  if (isDocx) {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: tidy(value), kind: 'docx' };
  }
  if (lower.endsWith('.txt') || lower.endsWith('.md') || mime.startsWith('text/')) return { text: tidy(buffer.toString('utf8')), kind: 'text' };
  throw Error('Unsupported file type. Upload a PDF, DOCX or plain text file, or paste the text.');
}

function tidy(text) {
  return joinWrapped(text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim());
}

// PDFs break a bullet into several physical lines. Rejoin them so each bullet is one line (and therefore
// one citable source): a line continues the previous one when it starts in lowercase, or the previous line
// clearly stopped mid-phrase (ends with a comma, hyphen, "and", an opening bracket, a month...).
const isHeading = (l) => l.length <= 40 && /[A-Z]/.test(l) && l === l.toUpperCase();
const stopsMidPhrase = (l) => /(?:[,;(&\u2013-]|\b(?:and|or|of|with|to|for|in|on|the|a|an|using|by|from|at)|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\d(?:st|nd|rd|th))$/i.test(l);
export function joinWrapped(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const prev = out[out.length - 1];
    const continues = prev !== undefined && prev !== '' && line !== '' && !isHeading(line) && !isHeading(prev) && !/^[\u2022\-*]\s/.test(line) &&
      (/^[a-z]/.test(line) || /^\d{4}\)/.test(line) || (/^\d/.test(line) && /^[\u2022\-*]\s/.test(prev) && !/[.!?]$/.test(prev)) || stopsMidPhrase(prev));
    if (!continues) { out.push(line); continue; }
    out[out.length - 1] = /[-\u2013]$/.test(prev) && /^[a-z]/.test(line) ? prev + line : /\d$/.test(prev) && /^(st|nd|rd|th)\b/.test(line) ? prev + line : `${prev} ${line}`;
  }
  return out.join('\n');
}
