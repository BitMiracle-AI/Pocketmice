// What the page shows of a file without the person downloading it: the start of a text, a picture, a PDF, or a
// video or a sound. Which of them, and whether at all, is told by the end of the name and by the size, with
// nothing of the browser in it.
// The bytes of a file are always handed out as a download and never as a page (see getFileDownloadUrl in the
// contract): the page fetches them and draws them itself, a text as text and a picture as a picture, so nothing a
// file holds is ever run. A PDF is handed to the reader the browser has for one. A video or a sound is played by
// the player the browser has, which fetches it from the storage itself, a part at a time: the page never holds
// it, so there is no size it is too large at.

/** How much of a text is shown, in bytes: its start. More than that is for a download */
export const TEXT_PREVIEW_BYTES = 64 * 1024;

/** The largest picture that is shown, in bytes: all of it is held by the page while it is */
export const IMAGE_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

/** The largest SVG that is shown, in bytes: it is handed to the browser written out in an address (dataAddressOf) */
export const SVG_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The largest PDF that is shown, in bytes: all of it is held by the page while it is, and it is fetched only when
 * the person opens it large, never for the small box
 */
export const PDF_PREVIEW_MAX_BYTES = 50 * 1024 * 1024;

/** The type of an SVG: the one picture here that can carry a script */
const SVG_TYPE = 'image/svg+xml';

/** What a browser draws as a picture, and what it has to be told the bytes are */
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: SVG_TYPE
};

/**
 * What a browser plays, by the end of its name: as a video or as a sound, and the type the name stands for. The
 * player is told the type, since the storage hands every object out as bytes of no particular kind.
 * Each of these was played in Chrome, Firefox and WebKit from an address of the storage. What a browser plays of
 * what is inside (how the pictures and the sound are packed) is its own: one it cannot play says so.
 */
const MEDIA: Record<string, { as: 'video' | 'audio'; type: string }> = {
  mp4: { as: 'video', type: 'video/mp4' },
  m4v: { as: 'video', type: 'video/mp4' },
  mov: { as: 'video', type: 'video/quicktime' },
  webm: { as: 'video', type: 'video/webm' },
  mp3: { as: 'audio', type: 'audio/mpeg' },
  m4a: { as: 'audio', type: 'audio/mp4' },
  wav: { as: 'audio', type: 'audio/wav' },
  ogg: { as: 'audio', type: 'audio/ogg' },
  flac: { as: 'audio', type: 'audio/flac' }
};

/** What is written to be read as text */
const TEXT_EXTENSIONS = new Set(
  ['txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'xml', 'html', 'htm']
    .concat(['css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'sh'])
    .concat(['sql', 'r', 'tex', 'srt', 'vtt', 'diff', 'patch'])
);

/** What a text is coloured as, by the end of its name: a language the highlighter knows (lib/loadHighlighter.tsx) */
const LANGUAGES: Record<string, string> = {
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'html',
  html: 'html',
  htm: 'html',
  css: 'css',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  sh: 'bash',
  sql: 'sql',
  diff: 'diff',
  patch: 'diff'
};

/** What follows the last dot of a name, in small letters. Nothing when the name has no dot, or begins with its only one */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The language a text called name is coloured as, when it is shown large. Null for one that is shown as it is */
export function languageOf(name: string): string | null {
  return LANGUAGES[extensionOf(name)] ?? null;
}

/** Whether a text called name is written in Markdown: shown large, it is laid out as the document it is */
export function isMarkdown(name: string): boolean {
  return languageOf(name) === 'markdown';
}

/** What stands between the values of a row, in a text whose name says it is a table */
const SEPARATORS: Record<string, string> = { csv: ',', tsv: '\t' };

/**
 * What stands between the values of a row in a text called name, when the name says it is a table: shown large,
 * it is laid out as one (rows.ts reads its rows). Null for any other text
 */
export function separatorOf(name: string): string | null {
  return SEPARATORS[extensionOf(name)] ?? null;
}

/** Whether the bytes begin the way a PDF does. What is handed to the reader of PDFs has to be one */
export function isPdf(bytes: ArrayBuffer): boolean {
  return new TextDecoder('latin1').decode(bytes.slice(0, 5)) === '%PDF-';
}

/**
 * How a file is shown: the first bytes of it as text, all of it as a picture of the type type, as a PDF, played as
 * a video or a sound of the type type, or not at all, and then why: it is empty, it is too large to hold, or it
 * is of a kind the page does not draw.
 * A picture that is scripted can carry a script (an SVG). Drawn as a picture it runs nothing; but the address it
 * is drawn from can be opened in a tab of its own, and an address of the page's own (blob:) would run the script
 * there as the person signed in. So it is drawn from a data: address, which belongs to no site.
 */
export type Preview =
  | { kind: 'text'; bytes: number; cut: boolean }
  | { kind: 'image'; type: string; scripted: boolean }
  | { kind: 'pdf' }
  | { kind: 'media'; as: 'video' | 'audio'; type: string }
  | { kind: 'none'; why: 'empty' | 'large' | 'kind' };

/** How a file called name that is size bytes is shown: by what follows its last dot, whatever its case */
export function previewOf(name: string, size: number): Preview {
  const extension = extensionOf(name);
  const type = IMAGE_TYPES[extension];
  const text = TEXT_EXTENSIONS.has(extension);
  const pdf = extension === 'pdf';
  const media = MEDIA[extension];
  if (!type && !text && !pdf && !media) return { kind: 'none', why: 'kind' };
  if (size === 0) return { kind: 'none', why: 'empty' };
  if (media) return { kind: 'media', ...media };
  if (pdf) return size > PDF_PREVIEW_MAX_BYTES ? { kind: 'none', why: 'large' } : { kind: 'pdf' };
  if (type) {
    const scripted = type === SVG_TYPE;
    const most = scripted ? SVG_PREVIEW_MAX_BYTES : IMAGE_PREVIEW_MAX_BYTES;
    return size > most ? { kind: 'none', why: 'large' } : { kind: 'image', type, scripted };
  }
  return { kind: 'text', bytes: Math.min(size, TEXT_PREVIEW_BYTES), cut: size > TEXT_PREVIEW_BYTES };
}

/** How a text may be written, in the order they are tried: the first that the bytes are written in is taken */
const ENCODINGS = ['utf-8', 'gb18030'];

/**
 * The text the bytes are. Nearly every text is written in UTF-8. One that is not is read as GB18030 when its bytes
 * are that: it is the other way Chinese text is commonly written, and what a spreadsheet on Windows saves a CSV
 * as. Bytes that are neither are shown as UTF-8, with a mark wherever they are not.
 * cut says they are only the start of the file: a character the cut went through is left out, where it would
 * otherwise show as a mark of something broken.
 */
export function textOf(bytes: ArrayBuffer, cut: boolean): string {
  for (const encoding of ENCODINGS) {
    try {
      // Read as the start of something longer, the bytes of a character that is not all there are no mistake:
      // they are held back for the rest, which here never comes
      return new TextDecoder(encoding, { fatal: true }).decode(bytes, { stream: cut });
    } catch {
      // Not written this way
    }
  }
  return new TextDecoder().decode(bytes, { stream: cut });
}

/** The bytes written out as a data: address of the type type, for a picture that must not be drawn from blob: */
export function dataAddressOf(bytes: ArrayBuffer, type: string): string {
  const all = new Uint8Array(bytes);
  let written = '';
  // A piece at a time: a call takes only so many arguments
  for (let at = 0; at < all.length; at += 0x8000) written += String.fromCharCode(...all.subarray(at, at + 0x8000));
  return `data:${type};base64,${btoa(written)}`;
}
