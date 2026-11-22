// Small text-only PDF maker and print helper (RRA-046).
//
// Some installed web apps can't print directly: Chrome may answer
// "This website has been blocked from automatic printing", and some iPhone
// home screen apps ignore the print call. A PDF always works: the phone's
// share sheet can print it, save it to Files or send it.

const PAGE_W = 612; // US letter, points
const PAGE_H = 792;
const MARGIN = 54;

// The built-in PDF fonts only cover plain Latin text; swap the rest.
const SWAP = { '×': 'x', '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '—': '-', '–': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '·': '-', '•': '-', '→': '->', '°': ' deg' };
const clean = (s) => String(s ?? '').replace(/[^\x20-\x7e]/g, (c) => SWAP[c] ?? '');
const pdfStr = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function wrap(line, max) {
  const out = [];
  let rest = line;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^ /, '');
  }
  out.push(rest);
  return out;
}

// lines: array of strings; a line starting with "# " is printed bold and larger.
export function textPdf(title, lines, { mono = false } = {}) {
  const size = mono ? 9.5 : 11;
  const lead = size * 1.35;
  const perLine = Math.floor((PAGE_W - 2 * MARGIN) / (size * (mono ? 0.6 : 0.5)));
  const rows = [{ t: clean(title), head: true }, { t: '' }];
  for (const raw of lines) {
    const head = String(raw).startsWith('# ');
    const t = clean(head ? String(raw).slice(2) : raw);
    for (const part of wrap(t, perLine)) rows.push({ t: part, head });
  }
  const perPage = Math.floor((PAGE_H - 2 * MARGIN) / lead);
  const pages = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));

  const body = mono ? 'Courier' : 'Helvetica';
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add('');
  const pagesObj = add('');
  const fBody = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${body} /Encoding /WinAnsiEncoding >>`);
  const fBold = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${body}-Bold /Encoding /WinAnsiEncoding >>`);
  const kids = [];
  pages.forEach((rs, n) => {
    let y = PAGE_H - MARGIN;
    let stream = 'BT\n';
    for (const r of rs) {
      y -= lead;
      stream += `/${r.head ? 'F2' : 'F1'} ${r.head ? size + 1.5 : size} Tf 1 0 0 1 ${MARGIN} ${y.toFixed(1)} Tm (${pdfStr(r.t)}) Tj\n`;
    }
    stream += `/F1 8 Tf 1 0 0 1 ${MARGIN} ${MARGIN / 2} Tm (${pdfStr(`${globalThis.BRAND.restaurant} - page ${n + 1} of ${pages.length}`)}) Tj\nET`;
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fBody} 0 R /F2 ${fBold} 0 R >> >> /Contents ${content} 0 R >>`));
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: 'application/pdf' });
}

const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || globalThis.BRAND.teamId;

// Share the PDF (the share sheet has Print, Save to Files, Mail...). Where
// sharing files isn't possible, open or download it instead.
export async function sharePdf(title, lines, opts) {
  const file = new File([textPdf(title, lines, opts)], `${slug(title)}.pdf`, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

// Print buttons: "Print" uses the phone's print dialog; "Save or share PDF"
// always works. Returns the HTML for both, plus a hint.
export const printButtons = () => `
  <div class="btn-row no-print" style="margin-top:14px">
    <button class="btn" id="print" type="button">Print</button>
    <button class="btn tonal" id="pdf" type="button">Save or share PDF</button>
  </div>
  <p class="muted small center no-print">${document.documentElement.classList.contains('is-ios') && document.documentElement.classList.contains('standalone') ? 'Print opens the share sheet: tap Print there.' : "If Print doesn't open, use Save or share PDF and print from the share sheet."}</p>`;

// Wires the buttons. getLines() returns the PDF lines when asked.
// RRA-071/072: the iPhone and iPad home screen app blocks window.print() and
// asks "blocked from automatically printing". There, Print opens the share
// sheet with the PDF instead, which has Print in it.
const blocksPrint = () => document.documentElement.classList.contains('is-ios') && document.documentElement.classList.contains('standalone');
export function wirePrint({ title, getLines, mono = false, $ }) {
  $('#print')?.addEventListener('click', () => {
    if (blocksPrint()) { sharePdf(title, getLines(), { mono }); return; }
    try { window.print(); } catch { sharePdf(title, getLines(), { mono }); }
  });
  $('#pdf')?.addEventListener('click', () => sharePdf(title, getLines(), { mono }));
}
