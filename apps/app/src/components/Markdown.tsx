import { cn } from 'cn';
import { Children, type ComponentProps, isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Code } from './Code';

// A text written in Markdown, laid out as a document: headings, lists, tables, code. The look is the one shadcn
// documents for typography, and its own table and code block.
// What is shown was written by anyone who can write to the space, a person or an agent, so nothing in it is
// trusted:
// - HTML in the text is not HTML here: it is shown as the characters it is written with.
// - A picture is not loaded. Loading one sends a request to wherever its address points, and that address is the
//   writer's to choose: it can carry anything the writer could read, to a server of theirs, the moment someone
//   looks at the document. What the picture was called is shown in its place.
// - A link leads somewhere only when it is a whole address of the web or of mail. It opens in a tab of its own,
//   which is told nothing of this page. A link to a place "next to this file" has no such place here, and is text.

/**
 * What a component here is handed besides what the element takes: the place in the document it was made from.
 * What the document says of an element is passed on first and the look is said after it, so a class the document
 * gives (that of a list of boxes to tick, the language of a piece of code) never takes the place of the look.
 */
type FromDocument<Tag extends keyof React.JSX.IntrinsicElements> = ComponentProps<Tag> & { node?: unknown };

/** Whether an address leads out to the web, or to mail: the only ones a link here follows */
const leadsOut = (address: string | undefined) => address !== undefined && /^(https?:\/\/|mailto:)/i.test(address);

/** The text inside what Markdown made of a piece of code */
function textIn(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
}

const components: Components = {
  h1: ({ node: _, ...rest }: FromDocument<'h1'>) => (
    <h1 {...rest} className="mt-10 scroll-m-20 text-4xl font-extrabold tracking-tight text-balance first:mt-0" />
  ),
  h2: ({ node: _, ...rest }: FromDocument<'h2'>) => (
    <h2 {...rest} className="mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0" />
  ),
  h3: ({ node: _, ...rest }: FromDocument<'h3'>) => (
    <h3 {...rest} className="mt-8 scroll-m-20 text-2xl font-semibold tracking-tight first:mt-0" />
  ),
  h4: ({ node: _, ...rest }: FromDocument<'h4'>) => (
    <h4 {...rest} className="mt-8 scroll-m-20 text-xl font-semibold tracking-tight first:mt-0" />
  ),
  p: ({ node: _, ...rest }: FromDocument<'p'>) => <p {...rest} className="leading-7 not-first:mt-6" />,
  blockquote: ({ node: _, ...rest }: FromDocument<'blockquote'>) => (
    <blockquote {...rest} className="mt-6 border-l-2 pl-6 italic" />
  ),
  // A list of boxes to tick has its boxes for marks, and no dots beside them
  ul: ({ node: _, className, ...rest }: FromDocument<'ul'>) => (
    <ul
      {...rest}
      className={className?.includes('contains-task-list') ? 'my-6 [&>li]:mt-2' : 'my-6 ml-6 list-disc [&>li]:mt-2'}
    />
  ),
  input: ({ node: _, ...rest }: FromDocument<'input'>) => <input {...rest} className="mr-2 align-middle" />,
  ol: ({ node: _, ...rest }: FromDocument<'ol'>) => <ol {...rest} className="my-6 ml-6 list-decimal [&>li]:mt-2" />,
  hr: ({ node: _, ...rest }: FromDocument<'hr'>) => <hr {...rest} className="my-8" />,
  a: ({ node: _, href, children, ...rest }: FromDocument<'a'>) =>
    leadsOut(href) ? (
      <a
        {...rest}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="font-medium text-primary underline underline-offset-4"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt, src }: FromDocument<'img'>) => (
    <span className="text-muted-foreground">{alt || (typeof src === 'string' ? src : '')}</span>
  ),
  // A piece of code inside a line. The code of a block is taken out of what Markdown made of it, by pre below
  code: ({ node: _, ...rest }: FromDocument<'code'>) => (
    <code {...rest} className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold" />
  ),
  pre: ({ children }: FromDocument<'pre'>) => {
    const [code] = Children.toArray(children);
    const props = isValidElement<{ className?: string; children?: ReactNode }>(code) ? code.props : {};
    const language = /language-(\S+)/.exec(props.className ?? '')?.[1] ?? null;
    return <Code text={textIn(props.children).replace(/\n$/, '')} language={language} className="mt-6" />;
  },
  table: ({ node: _, ...rest }: FromDocument<'table'>) => (
    <div className="my-6">
      <Table {...rest} />
    </div>
  ),
  thead: ({ node: _, ...rest }: FromDocument<'thead'>) => <TableHeader {...rest} />,
  tbody: ({ node: _, ...rest }: FromDocument<'tbody'>) => <TableBody {...rest} />,
  tr: ({ node: _, ...rest }: FromDocument<'tr'>) => <TableRow {...rest} />,
  th: ({ node: _, ...rest }: FromDocument<'th'>) => <TableHead {...rest} />,
  td: ({ node: _, ...rest }: FromDocument<'td'>) => <TableCell {...rest} className="whitespace-normal" />
};

/** The text, laid out as the document it is written as */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('select-text', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
