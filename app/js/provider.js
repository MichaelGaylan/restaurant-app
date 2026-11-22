// Payroll service adapter (RRA-095, from Payroll BPAY-014). The only file that
// talks to a payroll company. The Admin picks the service in Payroll settings.
//  • embedded  — payroll runs inside this app through the company's API
//  • connected — payroll runs in the company's own app; we send hours and tips
// Nothing is connected yet: every call goes to the stand-in, nothing is paid,
// filed or sent. Going live = an account, API keys and the small server.
import { BRAND } from './config.js';

export const PROVIDERS = [
  { id: 'test', name: 'Not connected (practice)', kind: 'test', ewa: true, note: 'Practice runs only. Nothing is paid or filed.' },
  { id: 'gusto-embedded', name: 'Gusto Embedded', kind: 'embedded', ewa: false, note: "Gusto's payroll API for apps. Follows Gusto's own payroll steps." },
  { id: 'check', name: 'Check', kind: 'embedded', ewa: false, note: 'API-first payroll for apps. Most control over screens.' },
  { id: 'adp-embedded', name: 'ADP Embedded Payroll', kind: 'embedded', ewa: false, note: "ADP's payroll API for apps. Large, long-established." },
  { id: 'zeal', name: 'Zeal', kind: 'embedded', ewa: true, note: 'Payroll API with built-in early pay (earned wage access).' },
  { id: 'gusto', name: 'Gusto', kind: 'connected', ewa: false, note: 'Standard Gusto account. Hours and tips sent each pay period.' },
  { id: 'adp-run', name: 'ADP RUN', kind: 'connected', ewa: false, note: 'ADP for small businesses.' },
  { id: 'paychex', name: 'Paychex Flex', kind: 'connected', ewa: false, note: 'Paychex for small and mid-size businesses.' },
  { id: 'quickbooks', name: 'QuickBooks Payroll', kind: 'connected', ewa: false, note: 'Good fit if the books are in QuickBooks.' },
  { id: 'toast', name: 'Toast Payroll', kind: 'connected', ewa: false, note: 'Best fit if the restaurant uses a Toast POS.' },
  { id: 'square', name: 'Square Payroll', kind: 'connected', ewa: false, note: 'Best fit if the restaurant uses a Square POS.' },
];
export const KIND_LABEL = { test: 'Practice', embedded: `Runs inside ${BRAND.shortName}`, connected: 'Runs in their app · we send hours & tips' };
export const providerOf = (P) => PROVIDERS.find((p) => p.id === P?.provider) || PROVIDERS[0];

export const POS = [
  { id: 'none', name: 'Not connected', note: 'Use CSV upload, or pick a POS below.' },
  { id: 'toast', name: 'Toast', note: 'Open API. Sales, time punches, card + declared cash tips.', fields: ['Client ID', 'Client secret', 'Restaurant GUID'] },
  { id: 'square', name: 'Square', note: 'Open API. Sales, timecards, tips.', fields: ['Access token', 'Location ID'] },
  { id: 'clover', name: 'Clover', note: 'API through a Clover app install.', fields: ['Merchant ID', 'API token'] },
  { id: 'spoton', name: 'SpotOn', note: 'No open API today. Use CSV upload.', csvOnly: true },
  { id: 'lightspeed', name: 'Lightspeed Restaurant', note: 'API for partners. Check access first.', fields: ['Client ID', 'Client secret', 'Business ID'] },
  { id: 'other', name: 'Other POS', note: 'Any POS that exports a daily sales/tips report.', csvOnly: true },
];
export const PAYROLL_FIELDS = { embedded: ['API key', 'Company ID'], connected: ['Account ID', 'API key (if offered)'] };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ref = (p) => p + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

export async function submitPayroll(P) {
  await wait(700);
  const p = providerOf(P);
  return { ok: true, id: ref(p.kind === 'connected' ? 'EX' : 'PR'), via: p.id };
}

// The hours-and-tips file a connected payroll service imports (CSV)
export function exportCsv(rows) {
  const head = 'Employee,Job,Regular hours,Overtime hours,Double time hours,Tips,Early pay repaid';
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [head, ...rows.map((x) => [x.name, x.position, x.reg.toFixed(2), x.ot.toFixed(2), x.dbl.toFixed(2), x.tips.toFixed(2), x.adv.toFixed(2)].map(q).join(','))].join('\n');
}
