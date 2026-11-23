import { fileContentPath, getFile } from '@pocketmice/contract/domains/file';
import { toast } from '@/components/ui/toast';
import { apiUrl, call, failureText, spaceChanged } from '@/lib/api';
import type { DriveFile } from './files';
import { fileText } from './text';

/** How long the frame a download starts in is kept, in milliseconds: long enough for the browser to take it over */
const FRAME_KEPT_MS = 60_000;

/**
 * Downloads a file: the browser fetches its content and saves it, as it saves any download. The bytes do not pass
 * through the page, so a file as large as a file may be costs the page no memory. With versionId it is the content
 * of that version, and not the one the file has now.
 * The browser does not tell the page how a download went. So the api is asked about the file first: when it is
 * gone, or the person is signed out, the page says so and nothing is started.
 */
export async function downloadFile(spaceId: string, file: Pick<DriveFile, 'id'>, versionId?: string): Promise<void> {
  const asked = await call(getFile, { spaceId, fileId: file.id });
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
  frame.src = apiUrl(fileContentPath({ spaceId, fileId: file.id, versionId }));
  document.body.append(frame);
  setTimeout(() => frame.remove(), FRAME_KEPT_MS);
}
