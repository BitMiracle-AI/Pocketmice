import { useState } from 'react';
import { copyText } from '@/lib/clipboard';

/** How long a button says "copied", in milliseconds */
const COPIED_FOR_MS = 1500;

/**
 * Copying at a click, for a button that says afterwards that it did: copy copies the text, and copied is true for
 * a moment once the text is on the clipboard.
 * onFailed is called when the browser keeps the clipboard from the page, for the page to show the text and say it
 * has to be copied by hand.
 */
export function useCopy(text: string, onFailed: () => void): { copied: boolean; copy: () => Promise<void> } {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!(await copyText(text))) return onFailed();
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPIED_FOR_MS);
  };

  return { copied, copy };
}
