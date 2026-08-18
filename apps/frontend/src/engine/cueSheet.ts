/**
 * Cue-sheet ingestion — the artifact a music supervisor or editor actually
 * has on hand (a spreadsheet: scene, temp, rights status, budget, deadline),
 * not a raw NLE-exported EDL. Parses CSV pasted or uploaded, tolerant of the
 * column naming a real cue sheet uses.
 */

export type RightsStatus = 'cleared' | 'pending' | 'unclear' | 'unknown';

export type CueSheetRow = {
  id: string;
  scene: string;
  description: string;
  tempArtist: string;
  tempTitle: string;
  rightsStatus: RightsStatus;
  budgetUsd: number | null;
  daysToLock: number | null;
  timecode: string;
};

const FIELD_ALIASES: Record<keyof Omit<CueSheetRow, 'id'>, string[]> = {
  scene:         ['scene', 'scene name', 'cue', 'cue name', 'scene #', 'scene number', 'scene id'],
  description:   ['description', 'scene description', 'notes', 'summary', 'synopsis', 'action'],
  tempArtist:    ['temp artist', 'temp_artist', 'artist', 'temp track artist', 'composer'],
  tempTitle:     ['temp title', 'temp_title', 'title', 'cue title', 'temp track', 'track', 'temp'],
  rightsStatus:  ['rights status', 'rights_status', 'rights', 'status', 'clearance status', 'clearance'],
  budgetUsd:     ['budget', 'budget_usd', 'budget usd', 'est cost', 'estimated cost', 'cost', 'license fee'],
  daysToLock:    ['days to lock', 'days_to_lock', 'deadline days', 'days left', 'lock in days', 'days'],
  timecode:      ['timecode', 'tc', 'in point', 'time code', 'in/out'],
};

const TEMPLATE_HEADERS = ['scene', 'description', 'temp_artist', 'temp_title', 'rights_status', 'budget_usd', 'days_to_lock'];
const TEMPLATE_ROWS = [
  ['12A - INT. DINER - NIGHT', 'Detective confronts the suspect across the table; slow-burn dread building to a reveal', 'Hans Zimmer', 'Time (Interstellar Score)', 'unclear', '4500', '9'],
  ['14 - EXT. HIGHWAY - DAY', 'Chase through freeway traffic after the heist', 'The Chemical Brothers', "Block Rockin' Beats", 'pending', '3200', '4'],
  ['22 - INT. CHURCH - DAY', 'Wedding vows, quiet joy building to release', 'Ludovico Einaudi', 'Nuvole Bianche', 'cleared', '0', '30'],
];

export function cueSheetTemplateCsv(): string {
  const rows = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS];
  return rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
}

function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** RFC4180-ish CSV parse: quoted fields, embedded commas/newlines, "" escapes. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeRights(raw: string): RightsStatus {
  const s = raw.trim().toLowerCase();
  if (/^(clear|cleared|ok|approved|good)/.test(s)) return 'cleared';
  if (/^(pending|in review|in progress|submitted|awaiting)/.test(s)) return 'pending';
  if (/^(unclear|blocked|denied|no|rejected|conflict)/.test(s)) return 'unclear';
  return 'unknown';
}

function parseNumberLoose(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export type ParseResult = { rows: CueSheetRow[]; warnings: string[] };

/**
 * Parses a cue-sheet CSV. Header row is matched by alias, order-independent.
 * A row missing `scene` is dropped (warned) — everything else defaults
 * safely (rightsStatus → 'unknown', numbers → null) so a partially-filled
 * sheet still triages instead of failing outright.
 */
export function parseCueSheetCsv(text: string): ParseResult {
  const grid = parseCsvRows(text);
  const warnings: string[] = [];
  if (grid.length === 0) return { rows: [], warnings: ['Empty file.'] };

  const headerRow = grid[0].map(normalizeHeader);
  const colIndex: Partial<Record<keyof Omit<CueSheetRow, 'id'>, number>> = {};
  (Object.keys(FIELD_ALIASES) as (keyof Omit<CueSheetRow, 'id'>)[]).forEach(field => {
    const idx = headerRow.findIndex(h => FIELD_ALIASES[field].includes(h));
    if (idx !== -1) colIndex[field] = idx;
  });

  if (colIndex.scene === undefined) {
    return { rows: [], warnings: ['No "scene" column found. Download the template to see the expected headers.'] };
  }

  const rows: CueSheetRow[] = [];
  grid.slice(1).forEach((r, i) => {
    const get = (field: keyof Omit<CueSheetRow, 'id'>) => {
      const idx = colIndex[field];
      return idx !== undefined ? (r[idx] ?? '').trim() : '';
    };
    const scene = get('scene');
    if (!scene) { warnings.push(`Row ${i + 2}: missing scene, skipped.`); return; }
    rows.push({
      id: `row-${i}-${scene.slice(0, 12).replace(/\W+/g, '')}`,
      scene,
      description: get('description'),
      tempArtist: get('tempArtist'),
      tempTitle: get('tempTitle'),
      rightsStatus: colIndex.rightsStatus !== undefined ? normalizeRights(get('rightsStatus')) : 'unknown',
      budgetUsd: colIndex.budgetUsd !== undefined ? parseNumberLoose(get('budgetUsd')) : null,
      daysToLock: colIndex.daysToLock !== undefined ? parseNumberLoose(get('daysToLock')) : null,
      timecode: get('timecode'),
    });
  });

  return { rows, warnings };
}
