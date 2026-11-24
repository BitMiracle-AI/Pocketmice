import { cn } from 'cn';
import type { ReactNode } from 'react';

// The icon of a file, told by the end of its name, and the icon of a folder. They are drawn the way the mark of
// the product is: blocks of one colour, with nothing around them. A folder is the folder of the mark; a file is a
// sheet with a corner turned down, in the colour its kind is known by, with a few white strokes that say the kind
// again for whoever does not tell colours apart. The colours are the drawings' own: the same in the dark, and
// the only warm ones on a page besides the mouse.

type Kind = 'text' | 'document' | 'sheet' | 'slides' | 'pdf' | 'image' | 'code' | 'archive' | 'audio' | 'video';

const EXTENSIONS: Record<Kind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'bmp', 'tif', 'tiff', 'avif', 'ico'],
  pdf: ['pdf'],
  document: ['doc', 'docx', 'odt', 'rtf', 'pages'],
  sheet: ['xls', 'xlsx', 'ods', 'numbers', 'csv', 'tsv'],
  slides: ['ppt', 'pptx', 'odp', 'key'],
  text: ['txt', 'md', 'markdown', 'log'],
  archive: ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar'],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'],
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi'],
  code: ['js', 'mjs', 'ts', 'tsx', 'jsx', 'py', 'ipynb', 'r', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'sh', 'sql'].concat([
    'html',
    'css',
    'json',
    'yaml',
    'yml',
    'toml',
    'xml'
  ])
};

const BY_EXTENSION = new Map(
  Object.entries(EXTENSIONS).flatMap(([kind, extensions]) => extensions.map((each) => [each, kind as Kind] as const))
);

/** The kind of a file called name: by what follows its last dot, whatever its case. None when that says nothing */
function kindOf(name: string): Kind | undefined {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? BY_EXTENSION.get(name.slice(dot + 1).toLowerCase()) : undefined;
}

/** The colour of the sheet of a file with no kind */
const PLAIN = '#a4aecb';

/** The colour of the sheet of each kind, and what is drawn on it. The drawing is 20 units wide and high */
const SHEETS: Record<Kind, [string, ReactNode]> = {
  text: [
    '#8b9ac4',
    <g key="marks" fill="#fff">
      <rect x="6.3" y="9" width="7.4" height="1.3" rx=".65" />
      <rect x="6.3" y="11.7" width="7.4" height="1.3" rx=".65" />
      <rect x="6.3" y="14.4" width="4.6" height="1.3" rx=".65" />
    </g>
  ],
  document: [
    '#4f8bff',
    <g key="marks" fill="#fff">
      <rect x="6.3" y="8.8" width="3.4" height="2.9" rx=".7" />
      <rect x="6.3" y="12.9" width="7.4" height="1.3" rx=".65" />
      <rect x="6.3" y="15.3" width="5.2" height="1.3" rx=".65" />
    </g>
  ],
  sheet: [
    '#2fb37a',
    <g key="marks" fill="#fff">
      <rect x="6.3" y="9" width="3.2" height="2.7" rx=".6" />
      <rect x="10.5" y="9" width="3.2" height="2.7" rx=".6" />
      <rect x="6.3" y="12.7" width="3.2" height="2.7" rx=".6" />
      <rect x="10.5" y="12.7" width="3.2" height="2.7" rx=".6" />
    </g>
  ],
  slides: [
    '#f58a3c',
    <g key="marks" fill="#fff">
      <rect x="6.3" y="12.6" width="1.9" height="3.1" rx=".6" />
      <rect x="9.05" y="10.6" width="1.9" height="5.1" rx=".6" />
      <rect x="11.8" y="8.7" width="1.9" height="7" rx=".6" />
    </g>
  ],
  pdf: ['#ef5a6f', <rect key="marks" fill="#fff" x="6.3" y="9.4" width="7.4" height="4.6" rx="1.3" />],
  image: [
    '#19b3c4',
    <g key="marks" fill="#fff">
      <circle cx="8" cy="10" r="1.35" />
      <path d="M6 15.7 9 12.4l1.9 1.9 1.5-1.5 1.7 2.9z" />
    </g>
  ],
  code: [
    '#4a57a8',
    <path
      key="marks"
      fill="none"
      stroke="#fff"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8.5 10.2 6.6 12.4l1.9 2.2M11.5 10.2l1.9 2.2-1.9 2.2"
    />
  ],
  archive: [
    '#f3b866',
    <g key="marks" fill="#162456">
      <rect x="9.3" y="8.4" width="1.4" height="1.6" rx=".4" />
      <rect x="9.3" y="11" width="1.4" height="1.6" rx=".4" />
      <rect x="9.3" y="13.6" width="1.4" height="1.6" rx=".4" />
    </g>
  ],
  audio: [
    '#8b6cf6',
    <g key="marks" fill="#fff">
      <circle cx="8.7" cy="14.1" r="1.6" />
      <rect x="9.3" y="9" width="1" height="5.1" />
      <rect x="9.3" y="8.8" width="3.9" height="1.5" rx=".6" />
    </g>
  ],
  video: ['#e0559a', <path key="marks" fill="#fff" d="M8.3 9.5v5.8l4.9-2.9z" />]
};

/** The icon of a file or a folder. It is decoration: the name is always next to it. className gives its size */
export function FileIcon({ name, folder = false, className }: { name: string; folder?: boolean; className?: string }) {
  if (folder) {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className={cn('size-5 shrink-0', className)}>
        <path
          fill="#193cb8"
          d="M1.5 5.5A1.5 1.5 0 0 1 3 4h3.6c.5 0 .9.2 1.2.5l.7.8c.3.3.7.5 1.2.5H17a1.5 1.5 0 0 1 1.5 1.5V15a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 15z"
        />
        <rect fill="#2b7fff" x="1.5" y="8.2" width="17" height="8.3" rx="1.5" />
      </svg>
    );
  }
  const kind = kindOf(name);
  const [colour, marks] = kind ? SHEETS[kind] : [PLAIN, null];
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn('size-5 shrink-0', className)}>
      <path
        fill={colour}
        d="M4 3.2a1.7 1.7 0 0 1 1.7-1.7h5.8L16 6v10.8a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 16.8z"
      />
      {/* The corner that is turned down: the sheet's own colour, darker */}
      <path fill="#162456" opacity=".28" d="M11.5 1.5 16 6h-3a1.5 1.5 0 0 1-1.5-1.5z" />
      {marks}
    </svg>
  );
}
