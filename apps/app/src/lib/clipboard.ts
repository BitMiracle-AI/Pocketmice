/**
 * Copies text to the clipboard, and says whether it is there. The browser may keep the clipboard from the page (a
 * page that is not served securely, a permission that was refused): whoever asked then shows the text and says it
 * has to be copied by hand. Call it from a click, which is when a browser lets a page write to the clipboard.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
