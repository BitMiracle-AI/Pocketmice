import {
  Csv01Icon,
  Doc01Icon,
  File01Icon,
  Folder01Icon,
  Image01Icon,
  MusicNote01Icon,
  Pdf01Icon,
  Ppt01Icon,
  SourceCodeIcon,
  Txt01Icon,
  Video01Icon,
  Xls01Icon,
  Zip01Icon
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { cn } from 'cn';

// The icon of a file, told by the end of its name. They are the icons of the icon library, in the grey of the
// list: the name next to it says which file it is, and the icon only says what kind.

const KINDS: [IconSvgElement, string[]][] = [
  [Image01Icon, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'bmp', 'tif', 'tiff', 'avif', 'ico']],
  [Pdf01Icon, ['pdf']],
  [Doc01Icon, ['doc', 'docx', 'odt', 'rtf', 'pages']],
  [Xls01Icon, ['xls', 'xlsx', 'ods', 'numbers']],
  [Ppt01Icon, ['ppt', 'pptx', 'odp', 'key']],
  [Csv01Icon, ['csv', 'tsv']],
  [Txt01Icon, ['txt', 'md', 'markdown', 'log']],
  [Zip01Icon, ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar']],
  [MusicNote01Icon, ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac']],
  [Video01Icon, ['mp4', 'mov', 'mkv', 'webm', 'avi']],
  [
    SourceCodeIcon,
    [
      'js',
      'mjs',
      'ts',
      'tsx',
      'jsx',
      'py',
      'ipynb',
      'r',
      'go',
      'rs',
      'java',
      'c',
      'h',
      'cpp',
      'sh',
      'sql',
      'html'
    ].concat(['css', 'json', 'yaml', 'yml', 'toml', 'xml'])
  ]
];

const BY_EXTENSION = new Map(KINDS.flatMap(([icon, extensions]) => extensions.map((each) => [each, icon] as const)));

/** The icon for a file called name: by what follows its last dot, whatever its case. A plain sheet when that says nothing */
function iconOf(name: string): IconSvgElement {
  const dot = name.lastIndexOf('.');
  return (dot > 0 && BY_EXTENSION.get(name.slice(dot + 1).toLowerCase())) || File01Icon;
}

/** The icon of a file or a folder. It is decoration: the name is always next to it. className gives its size */
export function FileIcon({ name, folder = false, className }: { name: string; folder?: boolean; className?: string }) {
  return (
    <HugeiconsIcon
      icon={folder ? Folder01Icon : iconOf(name)}
      strokeWidth={1.75}
      aria-hidden="true"
      className={cn('shrink-0 text-muted-foreground', className)}
    />
  );
}
