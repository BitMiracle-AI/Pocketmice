import type { ClientErrorCode } from '@pocketmice/client/api';
import type { UniversalErrorCode } from '@pocketmice/contract/errors';
import { freeName } from './freeName.ts';

// The uploads in hand, and what happens to each: this file is the rules, and knows nothing of the browser. What
// it needs from outside (reading a folder, sending bytes) is handed to it, so the rules can be tried in a test.
//
// An upload goes through these states:
//   waiting  it has not started: others are being sent, and only so many are at once
//   sending  the folder is looked at, then the bytes go up
//   taken    the name is already used in the folder. Nothing is sent, and nothing is written over, until the person
//            says which: save it as a new version of the file that is there, keep both under another name, or skip
//   done     it is in the space
//   failed   it is not, and why. It can be tried again: the file is still held
//
// No upload writes over a file by itself. The server refuses a name that is taken, and this looks at the folder
// first so that the bytes are not sent for nothing; either way the upload ends up taken, and waits.

/**
 * Why an upload failed: a code the api answered with (the four the content address has of its own, or one any
 * request may get), one this side arrived at, or that the file is larger than a file may be
 */
export type UploadFailure =
  | UniversalErrorCode
  | ClientErrorCode
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SPACE_STORAGE_LIMIT_EXCEEDED'
  | 'MEMBER_STORAGE_LIMIT_EXCEEDED'
  | 'TOO_LARGE';

/** What a folder holds under a name: a file, with the version its content is now; or a folder, which has none */
export interface Entry {
  fileId: string;
  versionId: string | null;
}

/** What is in a folder, by name; or why it could not be read */
export type Entries = { ok: true; entries: ReadonlyMap<string, Entry> } | { ok: false; code: UploadFailure };

/** Where the bytes of an upload go: a new file under a name, or a new version of a file that is there */
export type Target =
  | { spaceId: string; parentId: string | null; name: string }
  | { spaceId: string; fileId: string; baseVersionId: string };

export interface Upload {
  id: number;
  spaceId: string;
  /** The folder it goes to. Null is directly in the space */
  parentId: string | null;
  /** The name it goes up under: the file's own, or the free one found when the person chose to keep both */
  name: string;
  size: number;
  state: 'waiting' | 'sending' | 'taken' | 'done' | 'failed';
  /** How many bytes have gone up */
  sent: number;
  /** While taken: whether what has the name is a file, which can take this as a new version. A folder cannot */
  canBeVersion: boolean;
  /** Whether it is, or is to be, a new version of the file that had the name */
  asVersion: boolean;
  /** While failed: why */
  failure: UploadFailure | null;
}

export interface UploadDeps<Content> {
  /** The most bytes a file may have */
  maxBytes: number;
  /** How many uploads are being sent at one time, at most */
  atOnce: number;
  /**
   * What is in a folder. fresh asks the api now; without it, what was read a moment ago will do.
   */
  entriesAt: (spaceId: string, parentId: string | null, fresh: boolean) => Promise<Entries>;
  /**
   * Sends the content to target. progress is told how many bytes have gone up. done settles when the answer is
   * there, and never rejects; abort gives the upload up, after which what done settles with is not looked at.
   */
  send: (
    target: Target,
    content: Content,
    progress: (sent: number) => void
  ) => { done: Promise<{ ok: true } | { ok: false; code: UploadFailure }>; abort: () => void };
  /** Told that something was written in a space */
  changed: (spaceId: string) => void;
  /** Told the uploads there are, every time one of them changes: a new list each time */
  publish: (uploads: Upload[]) => void;
}

interface Item<Content> extends Upload {
  content: Content;
  /** The file this is to be a new version of, with the version it takes the place of */
  over: { fileId: string; baseVersionId: string } | null;
  /** While taken: what has the name */
  existing: Entry | null;
  /** While the bytes go up: gives the upload up */
  abort: (() => void) | null;
  /** While taken: a decision is being carried out, and another one is not taken */
  deciding: boolean;
  /** What was read of the folder a moment ago is known to be out of date: the next look asks the api */
  stale: boolean;
}

export function createUploadQueue<Content>(deps: UploadDeps<Content>) {
  let items: Item<Content>[] = [];
  let lastId = 0;

  function publish(): void {
    deps.publish(
      items.map(({ id, spaceId, parentId, name, size, state, sent, canBeVersion, asVersion, failure }) => ({
        id,
        spaceId,
        parentId,
        name,
        size,
        state,
        sent,
        canBeVersion,
        asVersion,
        failure
      }))
    );
  }

  /** Whether this upload is still in hand: one that was given up or skipped is not, and whatever was being done for it stops */
  const held = (item: Item<Content>) => items.includes(item);

  function settle(item: Item<Content>, state: 'done' | 'failed' | 'taken', failure: UploadFailure | null = null): void {
    item.state = state;
    item.failure = failure;
    item.abort = null;
    publish();
    pump();
  }

  function take(item: Item<Content>, existing: Entry): void {
    item.existing = existing;
    item.canBeVersion = existing.versionId !== null;
    item.over = null;
    item.asVersion = false;
    settle(item, 'taken');
  }

  /** Starts as many waiting uploads as may be sent at once */
  function pump(): void {
    for (const item of items) {
      if (items.filter((each) => each.state === 'sending').length >= deps.atOnce) return;
      if (item.state === 'waiting') void start(item);
    }
  }

  async function start(item: Item<Content>): Promise<void> {
    item.state = 'sending';
    item.sent = 0;
    item.failure = null;
    publish();

    // A new file: when the name is used already, nothing is sent
    if (!item.over) {
      const before = await deps.entriesAt(item.spaceId, item.parentId, item.stale);
      if (!held(item)) return;
      if (!before.ok) return settle(item, 'failed', before.code);
      item.stale = false;
      const existing = before.entries.get(item.name);
      if (existing) return take(item, existing);
    }

    const target: Target = item.over
      ? { spaceId: item.spaceId, ...item.over }
      : { spaceId: item.spaceId, parentId: item.parentId, name: item.name };
    const sending = deps.send(target, item.content, (sent) => {
      if (!held(item) || item.state !== 'sending') return;
      item.sent = sent;
      publish();
    });
    item.abort = sending.abort;
    const result = await sending.done;
    if (!held(item)) return;

    if (result.ok) {
      item.sent = item.size;
      deps.changed(item.spaceId);
      return settle(item, 'done');
    }

    if (item.over) {
      // The file it was to be a version of was written to in between, or is gone. Neither is written over: a file
      // that changed is shown as taken again, with the version it has now; one that is gone fails, and trying
      // again makes a new file under the name
      const fileId = item.over.fileId;
      item.over = null;
      item.asVersion = false;
      if (result.code !== 'CONFLICT') {
        // What was read of the folder had the file, and may be wrong about it now
        item.stale = true;
        return settle(item, 'failed', result.code);
      }
      const now = await deps.entriesAt(item.spaceId, item.parentId, true);
      if (!held(item)) return;
      const existing = now.ok ? [...now.entries.values()].find((entry) => entry.fileId === fileId) : undefined;
      return existing ? take(item, existing) : settle(item, 'failed', 'CONFLICT');
    }

    // A new file that was not made. Whatever the answer was, the folder is looked at again: when the name is used
    // there now, that is what the person has to decide about. The refusal of a name that is taken comes before
    // the bytes are read, and a browser that is still sending them may see a broken connection in its place
    const now = await deps.entriesAt(item.spaceId, item.parentId, true);
    if (!held(item)) return;
    const existing = now.ok ? now.entries.get(item.name) : undefined;
    return existing ? take(item, existing) : settle(item, 'failed', result.code);
  }

  const find = (id: number) => items.find((item) => item.id === id);

  function remove(item: Item<Content>): void {
    item.abort?.();
    items = items.filter((each) => each !== item);
    publish();
    pump();
  }

  return {
    /** Takes files to upload into a folder. They start in the order given, as many at once as may be */
    add(spaceId: string, parentId: string | null, files: { name: string; size: number; content: Content }[]): void {
      for (const { name, size, content } of files) {
        const tooLarge = size > deps.maxBytes;
        items.push({
          id: ++lastId,
          spaceId,
          parentId,
          name,
          size,
          content,
          state: tooLarge ? 'failed' : 'waiting',
          sent: 0,
          canBeVersion: false,
          asVersion: false,
          failure: tooLarge ? 'TOO_LARGE' : null,
          over: null,
          existing: null,
          abort: null,
          deciding: false,
          stale: false
        });
      }
      publish();
      pump();
    },

    /**
     * What the person decided about an upload whose name is taken. version: it becomes a new version of the file
     * that is there. both: it goes up under a free name next to it. skip: it is not uploaded.
     */
    async decide(id: number, choice: 'version' | 'both' | 'skip'): Promise<void> {
      const item = find(id);
      if (item?.state !== 'taken' || item.deciding) return;
      if (choice === 'skip') return remove(item);

      if (choice === 'version') {
        const { existing } = item;
        if (!existing || existing.versionId === null) return;
        item.over = { fileId: existing.fileId, baseVersionId: existing.versionId };
        item.asVersion = true;
      } else {
        item.deciding = true;
        const now = await deps.entriesAt(item.spaceId, item.parentId, false);
        item.deciding = false;
        if (!held(item)) return;
        if (!now.ok) return settle(item, 'failed', now.code);
        // Names other uploads to the same folder go up under are taken too, though the folder does not have them yet
        const others = items.filter(
          (each) =>
            each !== item && each.spaceId === item.spaceId && each.parentId === item.parentId && each.state !== 'failed'
        );
        item.name = freeName(item.name, new Set([...now.entries.keys(), ...others.map((each) => each.name)]));
      }
      item.state = 'waiting';
      item.existing = null;
      publish();
      pump();
    },

    /** Tries a failed upload again */
    retry(id: number): void {
      const item = find(id);
      if (item?.state !== 'failed' || item.failure === 'TOO_LARGE') return;
      item.state = 'waiting';
      item.failure = null;
      publish();
      pump();
    },

    /** Gives an upload up, whatever state it is in: one that is being sent is cut off. It is no longer listed */
    cancel(id: number): void {
      const item = find(id);
      if (item) remove(item);
    },

    /** Takes the uploads that are over out of the list: the ones that are done, and the ones that failed */
    clear(): void {
      items = items.filter((item) => item.state !== 'done' && item.state !== 'failed');
      publish();
    }
  };
}
