/**
 * Conversion SubRip (.srt) → WebVTT (.vtt) sans dépendance (S03-BE-03, B-03).
 * Gère : BOM UTF-8, fins de ligne CRLF / CR, numéros de cue (ignorés), horodatages `,` → `.`,
 * heures absentes (`mm:ss,ttt`), millisecondes sur 1 à 3 chiffres, blocs séparés par plusieurs
 * lignes vides, balises de position ASS `{\an8}` retirées, texte multi-lignes conservé.
 */

export interface SubtitleCue {
  start: string;
  end: string;
  /** Réglages WebVTT facultatifs (`align:start position:10%`), rares dans un SRT. */
  settings?: string;
  text: string;
}

export class SubtitleParseError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = 'SubtitleParseError';
  }
}

const TIMESTAMP = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/;
const CUE_LINE = /^(\S+)\s+-->\s+(\S+)(?:\s+(.*))?$/;

/** Normalise le texte brut : retire le BOM et convertit CRLF / CR en LF. */
export function normalizeText(input: string | Buffer): string {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/** Analyse un fichier SRT en cues ; lève `SubtitleParseError` si aucun cue valide n'est trouvé. */
export function parseSrt(input: string | Buffer): SubtitleCue[] {
  const lines = normalizeText(input).split('\n');
  const cues: SubtitleCue[] = [];
  let i = 0;
  while (i < lines.length) {
    // Sauter les lignes vides entre les blocs.
    while (i < lines.length && lines[i].trim() === '') i += 1;
    if (i >= lines.length) break;

    // Numéro de cue facultatif (toujours seul sur sa ligne en tête de bloc).
    if (/^\d+$/.test(lines[i].trim()) && i + 1 < lines.length && lines[i + 1].trim() !== '') {
      i += 1;
    }

    const header = lines[i].trim();
    const match = CUE_LINE.exec(header);
    if (!match) {
      throw new SubtitleParseError(
        `Expected a cue timing line, got "${header.slice(0, 40)}"`,
        i + 1,
      );
    }
    const start = toVttTimestamp(match[1], i + 1);
    const end = toVttTimestamp(match[2], i + 1);
    const settings = match[3]?.trim() || undefined;
    i += 1;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(cleanCueText(lines[i]));
      i += 1;
    }
    if (textLines.length > 0) cues.push({ start, end, settings, text: textLines.join('\n') });
  }
  if (cues.length === 0) throw new SubtitleParseError('No subtitle cue found');
  return cues;
}

/** `hh:mm:ss,mmm` (ou `mm:ss,mmm`) → `hh:mm:ss.mmm`. */
export function toVttTimestamp(raw: string, line?: number): string {
  const m = TIMESTAMP.exec(raw.trim());
  if (!m) throw new SubtitleParseError(`Invalid timestamp "${raw}"`, line);
  const hours = Number.parseInt(m[1] ?? '0', 10);
  const minutes = Number.parseInt(m[2], 10);
  const seconds = Number.parseInt(m[3], 10);
  const millis = Number.parseInt(m[4].padEnd(3, '0'), 10);
  if (minutes > 59 || seconds > 59) {
    throw new SubtitleParseError(`Invalid timestamp "${raw}"`, line);
  }
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

function cleanCueText(line: string): string {
  return line
    .replace(/\{\\an\d\}/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .trimEnd();
}

export function cuesToVtt(cues: SubtitleCue[]): string {
  const blocks = cues.map((c) => {
    const timing = `${c.start} --> ${c.end}${c.settings ? ` ${c.settings}` : ''}`;
    return `${timing}\n${c.text}`;
  });
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

/** Convertit un SRT complet en WebVTT. */
export function srtToVtt(input: string | Buffer): string {
  return cuesToVtt(parseSrt(input));
}

/** Vérifie et normalise un fichier WebVTT fourni tel quel (BOM retiré, LF, en-tête obligatoire). */
export function normalizeVtt(input: string | Buffer): string {
  const text = normalizeText(input);
  if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(text)) {
    throw new SubtitleParseError('A WebVTT file must start with "WEBVTT"', 1);
  }
  if (!/-->/.test(text)) throw new SubtitleParseError('No subtitle cue found');
  return text.endsWith('\n') ? text : `${text}\n`;
}

export type SubtitleFormat = 'srt' | 'vtt';

/** Détecte le format par l'extension du nom de fichier, puis par le contenu. */
export function detectSubtitleFormat(
  fileName: string,
  content: string | Buffer,
): SubtitleFormat | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === 'srt') return 'srt';
  if (ext === 'vtt') return 'vtt';
  const head = normalizeText(content).slice(0, 16);
  if (head.startsWith('WEBVTT')) return 'vtt';
  if (/^\d+\n/.test(head)) return 'srt';
  return null;
}

/** Point d'entrée : SRT ou VTT en entrée, WebVTT normalisé en sortie. */
export function toWebVtt(fileName: string, content: string | Buffer): string {
  const format = detectSubtitleFormat(fileName, content);
  if (format === 'srt') return srtToVtt(content);
  if (format === 'vtt') return normalizeVtt(content);
  throw new SubtitleParseError('Unsupported subtitle format (expected .srt or .vtt)');
}
