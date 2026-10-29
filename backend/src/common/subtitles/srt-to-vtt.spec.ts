import {
  detectSubtitleFormat,
  normalizeVtt,
  parseSrt,
  srtToVtt,
  SubtitleParseError,
  toVttTimestamp,
  toWebVtt,
} from './srt-to-vtt.js';

const BOM = String.fromCharCode(0xfeff);
const SRT = `1
00:00:01,000 --> 00:00:03,500
Bonjour Awa.

2
00:00:04,000 --> 00:00:06,250
Tu as lu le testament ?
Il cache un secret.
`;

describe('srtToVtt', () => {
  it('converts numbered cues and comma timestamps into WebVTT', () => {
    expect(srtToVtt(SRT)).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nBonjour Awa.\n\n00:00:04.000 --> 00:00:06.250\nTu as lu le testament ?\nIl cache un secret.\n',
    );
  });

  it('handles a UTF-8 BOM and CRLF line endings', () => {
    const crlf = Buffer.from(`${BOM}${SRT.replace(/\n/g, '\r\n')}`, 'utf8');
    expect(srtToVtt(crlf)).toBe(srtToVtt(SRT));
    expect(srtToVtt(crlf)).not.toContain('\r');
  });

  it('accepts cues without numbers, with hour-less timestamps and short milliseconds', () => {
    const vtt = srtToVtt(
      '00:01,5 --> 00:02,25\nSalut\n\n\n\n01:02:03,4 --> 01:02:04,004\nAu revoir',
    );
    expect(vtt).toContain('00:00:01.500 --> 00:00:02.250\nSalut');
    expect(vtt).toContain('01:02:03.400 --> 01:02:04.004\nAu revoir');
  });

  it('strips ASS positioning tags and keeps simple HTML tags', () => {
    const vtt = srtToVtt('1\n00:00:00,000 --> 00:00:01,000\n{\\an8}<i>Au nord</i>');
    expect(vtt).toContain('<i>Au nord</i>');
    expect(vtt).not.toContain('{\\an8}');
  });

  it('keeps cue settings after the timing line', () => {
    const cues = parseSrt('1\n00:00:00,000 --> 00:00:01,000 X1:10 X2:20\nTexte');
    expect(cues[0]).toMatchObject({ settings: 'X1:10 X2:20', text: 'Texte' });
  });

  it('throws SubtitleParseError with the line number on malformed input', () => {
    expect(() => srtToVtt('')).toThrow(SubtitleParseError);
    expect(() => srtToVtt('1\nnot a timing\nTexte')).toThrow(/Expected a cue timing line/);
    try {
      srtToVtt('1\n00:00:00,000 -> 00:00:01,000\nTexte');
    } catch (err) {
      expect(err).toBeInstanceOf(SubtitleParseError);
      expect((err as SubtitleParseError).line).toBe(2);
    }
    expect(() => toVttTimestamp('00:61:00,000')).toThrow(SubtitleParseError);
  });
});

describe('normalizeVtt / toWebVtt', () => {
  it('normalizes an existing WebVTT file (BOM, CRLF, trailing newline)', () => {
    const input = `${BOM}WEBVTT\r\n\r\n00:00.000 --> 00:01.000\r\nHi\r\n`;
    expect(normalizeVtt(input)).toBe('WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n');
    expect(normalizeVtt('WEBVTT - titre\n\n00:00.000 --> 00:01.000\nHi')).toMatch(/Hi\n$/);
  });

  it('rejects a .vtt without the WEBVTT header or without cues', () => {
    expect(() => normalizeVtt('00:00.000 --> 00:01.000\nHi')).toThrow(/must start with "WEBVTT"/);
    expect(() => normalizeVtt('WEBVTT\n\nNOTE rien')).toThrow(/No subtitle cue/);
  });

  it('detects the format from the extension, then from the content', () => {
    expect(detectSubtitleFormat('a.SRT', '')).toBe('srt');
    expect(detectSubtitleFormat('a.vtt', '')).toBe('vtt');
    expect(detectSubtitleFormat('a.txt', 'WEBVTT\n')).toBe('vtt');
    expect(detectSubtitleFormat('a.txt', '1\n00:00:00,000 --> 00:00:01,000\nx')).toBe('srt');
    expect(detectSubtitleFormat('a.txt', 'hello')).toBeNull();
    expect(() => toWebVtt('a.txt', 'hello')).toThrow(/Unsupported subtitle format/);
    expect(toWebVtt('ep1.srt', SRT)).toContain('WEBVTT');
  });
});
