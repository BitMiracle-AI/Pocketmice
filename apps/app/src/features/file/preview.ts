// What the page shows of a file without the person downloading it: the start of a text, or a picture. Which of the
// two, and whether at all, is told by the end of the name and by the size, with nothing of the browser in it.
// The api hands content out as a download and never as a page of its own (see fileContent.ts there): the page
// fetches the bytes and draws them itself, a text as text and a picture as a picture, so nothing a file holds is
// ever run.

/** How much of a text is shown, in bytes: its start. More than that is for a download */
export const TEXT_PREVIEW_BYTES = 64 * 1024;

/** The largest picture that is shown, in bytes: all of it is held by the page while it is */
export const IMAGE_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

/** The largest SVG that is shown, in bytes: it is handed to the browser written out in an address (dataAddressOf) */
export const SVG_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

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

/** What is written to be read as text */
const TEXT_EXTENSIONS = new Set(
  ['txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'xml', 'html', 'htm']
    .concat(['css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'sh'])
    .concat(['sql', 'r', 'tex', 'srt', 'vtt'])
);

/**
 * How a file is shown: the first bytes of it as text, all of it as a picture of the type type, or not at all, and
 * then why: it is empty, it is a picture too large to hold, or it is of a kind the page does not draw.
 * A picture that is scripted can carry a script (an SVG). Drawn as a picture it runs nothing; but the address it
 * is drawn from can be opened in a tab of its own, and an address of the page's own (blob:) would run the script
 * there as the person signed in. So it is drawn from a data: address, which belongs to no site.
 */
export type Preview =
  | { kind: 'text'; bytes: number; cut: boolean }
  | { kind: 'image'; type: string; scripted: boolean }
  | { kind: 'none'; why: 'empty' | 'large' | 'kind' };

/** How a file called name that is size bytes is shown: by what follows its last dot, whatever its case */
export function previewOf(name: string, size: number): Preview {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const type = IMAGE_TYPES[extension];
  const text = TEXT_EXTENSIONS.has(extension);
  if (!type && !text) return { kind: 'none', why: 'kind' };
  if (size === 0) return { kind: 'none', why: 'empty' };
  if (type) {
    const scripted = type === SVG_TYPE;
    const most = scripted ? SVG_PREVIEW_MAX_BYTES : IMAGE_PREVIEW_MAX_BYTES;
    return size > most ? { kind: 'none', why: 'large' } : { kind: 'image', type, scripted };
  }
  return { kind: 'text', bytes: Math.min(size, TEXT_PREVIEW_BYTES), cut: size > TEXT_PREVIEW_BYTES };
}

/**
 * The text the bytes are, read as UTF-8. cut says they are only the start of the file: a character the cut went
 * through is left out, where it would otherwise show as a mark of something broken.
 */
export function textOf(bytes: ArrayBuffer, cut: boolean): string {
  const text = new TextDecoder().decode(bytes);
  return cut ? text.replace(/�+$/u, '') : text;
}

/** The bytes written out as a data: address of the type type, for a picture that must not be drawn from blob: */
export function dataAddressOf(bytes: ArrayBuffer, type: string): string {
  const all = new Uint8Array(bytes);
  let written = '';
  // A piece at a time: a call takes only so many arguments
  for (let at = 0; at < all.length; at += 0x8000) written += String.fromCharCode(...all.subarray(at, at + 0x8000));
  return `data:${type};base64,${btoa(written)}`;
}
