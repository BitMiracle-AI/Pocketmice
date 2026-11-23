import { getFileDownloadUrl } from '@pocketmice/contract/domains/file';
import { toast } from '@/components/ui/toast';
import { call, failureText, spaceChanged } from '@/lib/api';
import type { DriveFile } from './files';
import { fileText } from './text';

/** How long the frame a download starts in is kept, in milliseconds: long enough for the browser to take it over */
const FRAME_KEPT_MS = 60_000;

/**
 * Downloads a file: the browser fetches its content and saves it, as it saves any download. The bytes do not pass
 * through the page, so a file as large as a file may be costs the page no memory. With versionId it is the content
 * of that version, and not the one the file has now.
 * The api is asked where the bytes are (getFileDownloadUrl), and the browser fetches them there: from the storage,
 * at an address that answers as a file to save, under the name of the file. When the file is gone, or the person
 * is signed out, the api says so: the page tells them, and nothing is started. How the download then goes, the
 * browser does not tell the page.
 */
export async function downloadFile(spaceId: string, file: Pick<DriveFile, 'id'>, versionId?: string): Promise<void> {
  const asked = await call(getFileDownloadUrl, { spaceId, fileId: file.id, versionId: versionId ?? null });
  if (!asked.ok) {
    toast.add({ type: 'error', title: failureText(asked.code, { NOT_FOUND: fileText.fileGone }) });
    // The list that still shows the file is out of date
    if (asked.code === 'NOT_FOUND') spaceChanged(spaceId);
    return;
  }

  // In a frame nobody sees, not in the page itself: the page stays where it is whatever the answer is, and is not
  // asked whether it may be left while files are being uploaded
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.src = asked.data.url;
  document.body.append(frame);
  setTimeout(() => frame.remove(), FRAME_KEPT_MS);
}
