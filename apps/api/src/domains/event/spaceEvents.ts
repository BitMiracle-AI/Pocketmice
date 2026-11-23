import { EVENTS_PATH, EVENTS_PING_MS, eventsQuery, type SpaceEvent } from '@pocketmice/contract/domains/event';
import { roleCovers } from '@pocketmice/contract/spaceRole';
import type { Db, DbReader } from '@pocketmice/db';
import { conversationMembers } from '@pocketmice/db/schema/conversation';
import { eq, sql } from 'drizzle-orm';
import type { Hono } from 'hono';
import { type AdmissionDeps, admitCaller, admitMember, describeIssues, fail } from '../../http/operation.ts';

// The events of the spaces: the address a caller hears at that something changed (its rules are in the contract,
// domains/event.ts), and how what happened in one request reaches the channels that are open.
// - Whoever changes something says so with tellSpace, in the transaction that changes it. What is said goes through
//   the database (NOTIFY): it is handed on when the transaction is committed, and not at all when it is not, to
//   every process of the api, this one included. So one process and several are the same thing, and nothing but
//   the database is needed for it.
// - Each process listens on one connection of its own, and hands what it hears to the channels open in it. Who is
//   told is decided at that moment, by who can read the conversation then.
// - Nothing is kept for a channel that is not open. A channel begins with open, and its caller reads what they hold
//   once more: that is how nothing is missed. When this process may have missed something itself (its listening
//   connection was lost and made again), it ends every channel it has, and their callers open new ones.

/** The name the database hands these on under. One for the whole database: what is said names its space */
const NOTIFY_CHANNEL = 'pocketmice_space_events';

/** Something that happened to a conversation, as the request that did it says it */
export interface Told {
  spaceId: string;
  conversationId: string;
  /** For a message that was sent: the number the conversation has reached. Left out for anything else */
  number?: number;
  /**
   * Who to tell besides whoever can read the conversation now: someone who could until this happened, like a
   * member who was taken out
   */
  alsoUserIds?: string[];
  /**
   * Tell every channel of the space. For a conversation that was deleted: who was in it cannot be read any more,
   * and the id of something that is gone tells nobody anything
   */
  wholeSpace?: boolean;
}

/**
 * Says that something happened to a conversation. Called with the transaction that changes it, it is handed on
 * when that is committed; called with the database, at once.
 */
export async function tellSpace(tx: DbReader, told: Told): Promise<void> {
  await tx.execute(sql`select pg_notify(${NOTIFY_CHANNEL}, ${JSON.stringify(told)})`);
}

export interface EventTimings {
  /** How often a ping is written, in milliseconds */
  pingMs: number;
  /** How long a channel stays open at most, in milliseconds */
  lifetimeMs: number;
}

const DEFAULT_TIMINGS: EventTimings = {
  pingMs: EVENTS_PING_MS,
  // Shorter than what a reverse proxy gives one request (five minutes is common): the one who ends a channel is
  // this server, and its caller opens the next, rather than a proxy cutting it off half way
  lifetimeMs: 4 * 60_000
};

export interface EventsDeps extends AdmissionDeps {
  db: Db;
  /**
   * Fires when the process is told to stop. Every channel is ended then: one left open would hold the process up
   * for as long as it stays open, and its caller opens the next one on the process that takes over
   */
  stopping?: AbortSignal;
  /** A test shortens the times */
  timings?: Partial<EventTimings>;
}

/** A channel that is open in this process */
interface Channel {
  userId: string;
  /** Whether its caller owns the space, and so reads every conversation of it */
  owner: boolean;
  send: (event: SpaceEvent | { type: 'ping' }) => void;
  end: () => void;
}

/** Mounts the address on the app, and starts listening for what the requests of every process say */
export function mountEvents(app: Hono, deps: EventsDeps): void {
  const timings = { ...DEFAULT_TIMINGS, ...deps.timings };
  /** The channels open in this process, by space */
  const open = new Map<string, Set<Channel>>();
  const report = (error: unknown) => deps.reportError(error, EVENTS_PATH);

  /** What was heard is handed on one at a time, in the order it was said */
  let handing: Promise<void> = Promise.resolve();
  let listened = false;
  const listening = deps.db.$client.listen(
    NOTIFY_CHANNEL,
    (payload) => {
      handing = handing.then(() => handOn(payload)).catch(report);
    },
    () => {
      // Called each time the connection starts listening. A second time means it was lost and made again, and what
      // was said in between was not heard: the callers are made to read again, by ending their channels
      if (listened) endAll();
      listened = true;
    }
  );
  // A database that cannot be listened on is reported when it happens, and again to whoever opens a channel
  listening.catch(report);

  const endAll = () => {
    for (const channels of open.values()) for (const channel of [...channels]) channel.end();
  };
  deps.stopping?.addEventListener('abort', endAll);

  async function handOn(payload: string): Promise<void> {
    const told = JSON.parse(payload) as Told;
    const channels = open.get(told.spaceId);
    if (!channels || channels.size === 0) return;

    const event: SpaceEvent =
      told.number === undefined
        ? { type: 'conversation', conversationId: told.conversationId }
        : { type: 'message', conversationId: told.conversationId, number: told.number };

    let readers: Set<string> | null = null;
    if (!told.wholeSpace) {
      const members = await deps.db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, told.conversationId));
      readers = new Set([...members.map(({ userId }) => userId), ...(told.alsoUserIds ?? [])]);
    }
    for (const channel of channels) {
      if (readers === null || channel.owner || readers.has(channel.userId)) channel.send(event);
    }
  }

  app.get(EVENTS_PATH, async (c) => {
    const caller = await admitCaller(c, { access: 'authenticated', kind: 'read' }, deps);
    if (caller instanceof Response) return caller;
    // The address is not public, so whoever got past admitCaller is somebody
    if (!caller.user) throw new Error('The events address was reached without a caller.');
    const query = eventsQuery.safeParse(c.req.query());
    if (!query.success) return fail(c, 'INVALID_INPUT', describeIssues(query.error.issues));
    const { spaceId } = query.data;
    const membership = await admitMember(c, spaceId, 'viewer', caller.user, deps);
    if (membership instanceof Response) return membership;
    // From here on, what is said reaches this process
    await listening;

    const encoder = new TextEncoder();
    const userId = caller.user.id;
    let close = () => {};
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        let ended = false;
        const channel: Channel = {
          userId,
          owner: roleCovers(membership.role, 'owner'),
          send: (event) => {
            if (!ended) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          },
          end: () => {
            close();
            controller.close();
          }
        };
        const channels = open.get(spaceId) ?? new Set<Channel>();
        open.set(spaceId, channels);
        channels.add(channel);

        // Neither timer keeps the process from stopping
        const beat = setInterval(() => channel.send({ type: 'ping' }), timings.pingMs).unref();
        const lifetime = setTimeout(() => channel.end(), timings.lifetimeMs).unref();
        close = () => {
          if (ended) return;
          ended = true;
          clearInterval(beat);
          clearTimeout(lifetime);
          channels.delete(channel);
          if (channels.size === 0 && open.get(spaceId) === channels) open.delete(spaceId);
        };

        // It is among the open channels before this is written: nothing said from here on passes it by
        channel.send({ type: 'open' });
        if (deps.stopping?.aborted) channel.end();
      },
      // The caller went away
      cancel: () => close()
    });

    return c.body(body, 200, {
      'content-type': 'text/event-stream',
      // A proxy in between neither changes it nor keeps it
      'cache-control': 'no-cache, no-transform',
      // A proxy that would collect the answer before passing it on (nginx) is told not to
      'x-accel-buffering': 'no'
    });
  });
}
