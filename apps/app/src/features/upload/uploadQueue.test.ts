// The rules of the uploads, with a folder and a line that are made up. To run it, in apps/app:
// node --test src/features/upload/uploadQueue.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as turn } from 'node:timers/promises';
import { createUploadQueue, type Entry, type Target, type Upload, type UploadFailure } from './uploadQueue.ts';

const SPACE = 'space-1';

interface Sent {
  target: Target;
  content: string;
  progress: (sent: number) => void;
  /** Settles the request: the answer arrives */
  answer: (result: { ok: true } | { ok: false; code: UploadFailure }) => void;
  aborted: boolean;
}

/**
 * A queue over one folder of one space (directly in the space). folder is what the api would say is in it; cached
 * is what was read a moment ago, which is what a look that is not fresh gets. sends are the requests that went out.
 */
function setup({ atOnce = 2, maxBytes = 100 } = {}) {
  const folder = new Map<string, Entry>();
  let cached: Map<string, Entry> | null = null;
  const sends: Sent[] = [];
  const changed: string[] = [];
  let uploads: Upload[] = [];
  const state = { unreadable: null as UploadFailure | null };

  const queue = createUploadQueue<string>({
    maxBytes,
    atOnce,
    entriesAt: async (_spaceId, _parentId, fresh) => {
      if (state.unreadable) return { ok: false, code: state.unreadable };
      if (fresh || !cached) cached = new Map(folder);
      return { ok: true, entries: cached };
    },
    send: (target, content, progress) => {
      let answer: Sent['answer'] = () => undefined;
      const done = new Promise<{ ok: true } | { ok: false; code: UploadFailure }>((resolve) => {
        answer = resolve;
      });
      const sent: Sent = { target, content, progress, answer, aborted: false };
      sends.push(sent);
      return {
        done,
        abort: () => {
          sent.aborted = true;
        }
      };
    },
    // What was written makes what was read a moment ago stale, as in the app
    changed: (spaceId) => {
      changed.push(spaceId);
      cached = null;
    },
    publish: (next) => {
      uploads = next;
    }
  });

  const file = (name: string, size = 10) => ({ name, size, content: `content of ${name}` });
  return {
    queue,
    folder,
    sends,
    changed,
    state,
    file,
    add: (...names: string[]) =>
      queue.add(
        SPACE,
        null,
        names.map((name) => file(name))
      ),
    /** What the list shows: the name and the state of each upload */
    shown: () => uploads.map((upload) => `${upload.name}: ${upload.state}`),
    upload: (name: string) => uploads.find((upload) => upload.name === name),
    /** The request that is out for this content, the last one when it was sent more than once */
    sent: (name: string) => {
      const found = sends.findLast((each) => each.content === `content of ${name}`);
      assert.ok(found, `nothing was sent for ${name}`);
      return found;
    },
    /** The server makes the file, as it does when an upload works */
    arrive(name: string, entry: Entry = { fileId: `id of ${name}`, versionId: `v1 of ${name}` }) {
      folder.set(name, entry);
    }
  };
}

test('uploads start in the order given, only so many at once, and the next starts when one is done', async () => {
  const { add, shown, sent, changed, sends, upload, arrive } = setup({ atOnce: 2 });

  add('a.txt', 'b.txt', 'c.txt');
  await turn();
  assert.deepEqual(shown(), ['a.txt: sending', 'b.txt: sending', 'c.txt: waiting']);
  assert.deepEqual(sent('a.txt').target, { spaceId: SPACE, parentId: null, name: 'a.txt' });

  sent('a.txt').progress(4);
  assert.equal(upload('a.txt')?.sent, 4);

  arrive('a.txt');
  sent('a.txt').answer({ ok: true });
  await turn();
  assert.deepEqual(shown(), ['a.txt: done', 'b.txt: sending', 'c.txt: sending']);
  assert.equal(upload('a.txt')?.sent, 10);
  assert.deepEqual(changed, [SPACE]);
  assert.equal(sends.length, 3);
});

test('a file larger than a file may be fails at once, is never sent, and cannot be tried again', async () => {
  const { queue, file, shown, sends, upload } = setup({ maxBytes: 100 });

  queue.add(SPACE, null, [file('huge.bin', 101), file('fits.bin', 100)]);
  await turn();

  assert.deepEqual(shown(), ['huge.bin: failed', 'fits.bin: sending']);
  assert.equal(upload('huge.bin')?.failure, 'TOO_LARGE');
  queue.retry(upload('huge.bin')?.id ?? 0);
  await turn();
  assert.deepEqual(shown(), ['huge.bin: failed', 'fits.bin: sending']);
  assert.equal(sends.length, 1);
});

test('a name that is used in the folder: nothing is sent, and the upload waits for a decision', async () => {
  const { add, shown, sends, upload, arrive } = setup();
  arrive('report.pdf');

  add('report.pdf', 'other.pdf');
  await turn();

  assert.deepEqual(shown(), ['report.pdf: taken', 'other.pdf: sending']);
  assert.equal(upload('report.pdf')?.canBeVersion, true);
  assert.equal(sends.length, 1);
});

test('decided as a new version, it is sent over the file that is there, naming the version it replaces', async () => {
  const { add, queue, shown, sent, upload, arrive } = setup();
  arrive('report.pdf', { fileId: 'file-7', versionId: 'version-3' });
  add('report.pdf');
  await turn();

  await queue.decide(upload('report.pdf')?.id ?? 0, 'version');
  await turn();

  assert.deepEqual(sent('report.pdf').target, { spaceId: SPACE, fileId: 'file-7', baseVersionId: 'version-3' });
  sent('report.pdf').answer({ ok: true });
  await turn();
  assert.deepEqual(shown(), ['report.pdf: done']);
  assert.equal(upload('report.pdf')?.asVersion, true);
});

test('decided to keep both, it goes up under a free name; two of them do not get the same one', async () => {
  const { queue, file, shown, sends, arrive } = setup({ atOnce: 1 });
  arrive('report.pdf');
  queue.add(SPACE, null, [file('report.pdf'), file('report.pdf')]);
  await turn();
  await turn();
  assert.deepEqual(shown(), ['report.pdf: taken', 'report.pdf: taken']);

  await queue.decide(1, 'both');
  await queue.decide(2, 'both');
  await turn();

  assert.deepEqual(shown(), ['report (2).pdf: sending', 'report (3).pdf: waiting']);
  assert.deepEqual(sends[0]?.target, { spaceId: SPACE, parentId: null, name: 'report (2).pdf' });
});

test('skipped, it is gone, and the one waiting behind it starts', async () => {
  const { add, queue, shown, upload, arrive } = setup({ atOnce: 1 });
  arrive('report.pdf');
  add('report.pdf');
  await turn();

  await queue.decide(upload('report.pdf')?.id ?? 0, 'skip');

  assert.deepEqual(shown(), []);
});

test('a name a folder has cannot take a new version: only keeping both or skipping is left', async () => {
  const { add, queue, shown, sends, upload, arrive } = setup();
  arrive('Reports', { fileId: 'folder-1', versionId: null });
  add('Reports');
  await turn();

  assert.equal(upload('Reports')?.canBeVersion, false);
  await queue.decide(upload('Reports')?.id ?? 0, 'version');
  await turn();
  assert.deepEqual(shown(), ['Reports: taken']);
  assert.equal(sends.length, 0);
});

test('the server refuses a name the folder did not show: after a fresh look the upload is taken', async () => {
  const { add, shown, sent, upload, arrive } = setup();
  add('a.txt');
  await turn();
  // Somebody else makes the file while this one goes up
  arrive('a.txt', { fileId: 'file-1', versionId: 'version-1' });

  sent('a.txt').answer({ ok: false, code: 'CONFLICT' });
  await turn();

  assert.deepEqual(shown(), ['a.txt: taken']);
  assert.equal(upload('a.txt')?.canBeVersion, true);
});

test('the line breaks and the name is still free: the upload failed, and trying again sends it again', async () => {
  const { add, queue, shown, sent, sends, upload } = setup();
  add('a.txt');
  await turn();

  sent('a.txt').answer({ ok: false, code: 'UNREACHABLE' });
  await turn();
  assert.deepEqual(shown(), ['a.txt: failed']);
  assert.equal(upload('a.txt')?.failure, 'UNREACHABLE');

  queue.retry(upload('a.txt')?.id ?? 0);
  await turn();
  assert.deepEqual(shown(), ['a.txt: sending']);
  assert.equal(sends.length, 2);
});

test('the line breaks and the name is used by then: that is what the person decides about', async () => {
  const { add, shown, sent, arrive } = setup();
  add('a.txt');
  await turn();
  arrive('a.txt');

  sent('a.txt').answer({ ok: false, code: 'UNREACHABLE' });
  await turn();

  assert.deepEqual(shown(), ['a.txt: taken']);
});

test('a version whose file was written to in between is not sent over it: taken again, with the version it has now', async () => {
  const { add, queue, shown, sent, upload, arrive } = setup();
  arrive('a.txt', { fileId: 'file-1', versionId: 'version-1' });
  add('a.txt');
  await turn();
  await queue.decide(upload('a.txt')?.id ?? 0, 'version');
  await turn();
  arrive('a.txt', { fileId: 'file-1', versionId: 'version-2' });

  sent('a.txt').answer({ ok: false, code: 'CONFLICT' });
  await turn();
  assert.deepEqual(shown(), ['a.txt: taken']);
  assert.equal(upload('a.txt')?.asVersion, false);

  await queue.decide(upload('a.txt')?.id ?? 0, 'version');
  await turn();
  assert.deepEqual(sent('a.txt').target, { spaceId: SPACE, fileId: 'file-1', baseVersionId: 'version-2' });
});

test('a version whose file is gone fails, and trying again makes a new file under the name', async () => {
  const { add, queue, shown, sent, upload, arrive, folder } = setup();
  arrive('a.txt', { fileId: 'file-1', versionId: 'version-1' });
  add('a.txt');
  await turn();
  await queue.decide(upload('a.txt')?.id ?? 0, 'version');
  await turn();
  folder.delete('a.txt');

  sent('a.txt').answer({ ok: false, code: 'NOT_FOUND' });
  await turn();
  assert.deepEqual(shown(), ['a.txt: failed']);
  assert.equal(upload('a.txt')?.failure, 'NOT_FOUND');

  queue.retry(upload('a.txt')?.id ?? 0);
  await turn();
  assert.deepEqual(sent('a.txt').target, { spaceId: SPACE, parentId: null, name: 'a.txt' });
});

test('an upload given up while it is sent is cut off and gone; its answer, when it comes, changes nothing', async () => {
  const { add, queue, shown, sent, upload, changed } = setup({ atOnce: 1 });
  add('a.txt', 'b.txt');
  await turn();
  const first = sent('a.txt');

  queue.cancel(upload('a.txt')?.id ?? 0);
  await turn();
  assert.equal(first.aborted, true);
  assert.deepEqual(shown(), ['b.txt: sending']);

  first.progress(5);
  first.answer({ ok: true });
  await turn();
  assert.deepEqual(shown(), ['b.txt: sending']);
  assert.deepEqual(changed, []);
});

test('a folder that cannot be read fails the upload with what the api said', async () => {
  const { add, shown, upload, state, sends } = setup();
  state.unreadable = 'NOT_FOUND';

  add('a.txt');
  await turn();

  assert.deepEqual(shown(), ['a.txt: failed']);
  assert.equal(upload('a.txt')?.failure, 'NOT_FOUND');
  assert.equal(sends.length, 0);
});

test('clearing takes out what is over, and leaves what is not', async () => {
  const { queue, file, shown, sent, arrive } = setup({ atOnce: 3, maxBytes: 100 });
  arrive('taken.txt');
  queue.add(SPACE, null, [file('done.txt'), file('huge.bin', 500), file('taken.txt'), file('going.txt')]);
  await turn();
  arrive('done.txt');
  sent('done.txt').answer({ ok: true });
  await turn();
  assert.deepEqual(shown(), ['done.txt: done', 'huge.bin: failed', 'taken.txt: taken', 'going.txt: sending']);

  queue.clear();

  assert.deepEqual(shown(), ['taken.txt: taken', 'going.txt: sending']);
});
