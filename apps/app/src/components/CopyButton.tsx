import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCopy } from '@/hooks/useCopy';
import { commonText } from '@/lib/text';

/**
 * A button that copies text: a key, a link. label says what it copies, for whoever cannot see its icon.
 * onFailed is called when the browser keeps the clipboard from the page, for the page to show the text and say it
 * has to be copied by hand.
 */
export function CopyButton({ text, label, onFailed }: { text: string; label: string; onFailed: () => void }) {
  const { copied, copy } = useCopy(text, onFailed);

  return (
    <Tooltip>
      {/* The tooltip stays when the button is clicked, and then says the text was copied: closed, as a click closes
          one otherwise, nothing would say so but the icon */}
      <TooltipTrigger
        closeOnClick={false}
        render={
          <Button variant="ghost" size="icon-sm" aria-label={label} onClick={copy} className="text-muted-foreground" />
        }
      >
        <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent>{copied ? commonText.ui.copied : commonText.ui.copy}</TooltipContent>
    </Tooltip>
  );
}
