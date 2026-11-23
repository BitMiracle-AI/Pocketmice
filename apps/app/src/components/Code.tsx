import { CodeBlock, CodeBlockContent, CodeBlockLine } from '@/components/ui/code-block';
import { useHighlightedCode } from '@/hooks/useHighlightedCode';

/**
 * Text shown as code: in the one width of a code font, with a colour for each kind of word when language is one
 * the highlighter knows (lib/loadHighlighter.tsx lists them). With no language, or one it does not know, the text
 * is shown as it is, and its long lines are wrapped: it is then more likely prose than code.
 * The colours arrive a moment after the text: the highlighter and the language are loaded when first used.
 */
export function Code({ text, language, className }: { text: string; language: string | null; className?: string }) {
  const lines = useHighlightedCode(text, language ?? '');

  return (
    <CodeBlock className={className}>
      <CodeBlockContent wrap={language === null}>
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the lines of a text are told apart by their position alone
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  );
}
