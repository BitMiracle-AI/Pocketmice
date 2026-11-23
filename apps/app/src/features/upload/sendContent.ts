import { failureOf } from '@pocketmice/client/api';
import { fileContentPath } from '@pocketmice/contract/domains/file';
import { apiAddress, heardFailure } from '@/lib/api';
import type { Target, UploadFailure } from './uploadQueue';

/** The codes the content address refuses an upload with, besides the ones any request may get */
const REFUSALS = ['NOT_FOUND', 'CONFLICT'] as const;

/**
 * Sends the content of a file to the address the content goes through (see FILE_CONTENT_PATH in the contract): a
 * PUT whose body is the bytes. progress is told how many bytes have gone up.
 * It is sent with XMLHttpRequest and not with fetch: fetch does not say how much of a body has gone up, and a
 * file may take minutes.
 * The browser reads the file from the disk as it sends it: the bytes are not held in the page.
 */
export function sendContent(target: Target, content: Blob, progress: (sent: number) => void) {
  const request = new XMLHttpRequest();
  const done = new Promise<{ ok: true } | { ok: false; code: UploadFailure }>((resolve) => {
    request.upload.onprogress = (event) => progress(event.loaded);
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve({ ok: true });
      const failure = failureOf('the upload', request.status, request.responseText, REFUSALS);
      heardFailure(failure.code);
      resolve(failure);
    };
    // The connection broke, or the server could not be reached: the browser says no more than that
    request.onerror = () => resolve({ ok: false, code: 'UNREACHABLE' });
    // Given up by the person: whoever asked for that no longer looks at the answer
    request.onabort = () => resolve({ ok: false, code: 'UNREACHABLE' });
  });

  request.open('PUT', apiAddress(fileContentPath(target)));
  // The api is at another origin: the sign-in cookie goes along only when the request says so
  request.withCredentials = true;
  request.send(content);
  return { done, abort: () => request.abort() };
}
