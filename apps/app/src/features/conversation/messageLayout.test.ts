// To run it, in apps/app: node --test src/features/conversation/messageLayout.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Message } from './conversations.ts';
import {
  earlierStart,
  firstUnreadNumber,
  layOut,
  RUN_GAP_MS,
  unreadCount,
  WINDOW_STEP,
  windowStart
} from './messageLayout.ts';

test('a page opens a conversation with its latest messages, from a multiple of the step on', () => {
  assert.equal(WINDOW_STEP, 50);
  // Everything, up to twice the step
  assert.equal(windowStart(0), 0);
  assert.equal(windowStart(1), 0);
  assert.equal(windowStart(100), 0);
  // One more, and the window begins a step later: it holds the latest 51
  assert.equal(windowStart(101), 50);
  assert.equal(windowStart(150), 50);
  assert.equal(windowStart(151), 100);
  assert.equal(windowStart(12_345), 12_250);

  // The window never holds fewer than a step of messages, where there are that many, nor more than two steps
  for (let last = 0; last <= 1000; last += 1) {
    const held = last - windowStart(last);
    assert.ok(held <= 2 * WINDOW_STEP, `${last}: ${held} messages`);
    assert.ok(held > WINDOW_STEP || windowStart(last) === 0, `${last}: ${held} messages`);
    assert.equal(windowStart(last) % WINDOW_STEP, 0);
  }
});

test('earlier messages are shown a step at a time, down to the first', () => {
  assert.equal(earlierStart(150), 100);
  assert.equal(earlierStart(50), 0);
  assert.equal(earlierStart(20), 0);
  assert.equal(earlierStart(0), 0);
});

test('what is unread is what was sent after the message the person read last; the owner who is no member has nothing unread', () => {
  assert.equal(unreadCount({ lastMessageNumber: 12, lastReadNumber: 9 }), 3);
  assert.equal(unreadCount({ lastMessageNumber: 12, lastReadNumber: 12 }), 0);
  assert.equal(unreadCount({ lastMessageNumber: 0, lastReadNumber: 0 }), 0);
  assert.equal(unreadCount({ lastMessageNumber: 12, lastReadNumber: null }), 0);
});

test('the first unread message is the one after the last that was read, when there is one', () => {
  assert.equal(firstUnreadNumber({ lastMessageNumber: 12, lastReadNumber: 9 }), 10);
  // Nothing read yet: the first message there is
  assert.equal(firstUnreadNumber({ lastMessageNumber: 12, lastReadNumber: 0 }), 1);
  // Everything read: the message that arrives next is not it, for a page that asked when it opened
  assert.equal(firstUnreadNumber({ lastMessageNumber: 12, lastReadNumber: 12 }), null);
  assert.equal(firstUnreadNumber({ lastMessageNumber: 0, lastReadNumber: 0 }), null);
  assert.equal(firstUnreadNumber({ lastMessageNumber: 12, lastReadNumber: null }), null);
});

const START = Date.parse('2026-11-23T09:00:00Z');
const GRACE = { id: 'u-grace', name: 'Grace' };
const LINUS = { id: 'u-linus', name: 'Linus' };
const AGENT = { id: 'k-1', name: 'Research agent' };

/** A message numbered number, sent so many minutes after nine, by a person or through a key of theirs */
function message(number: number, minutes: number, user = GRACE, apiKey: Message['apiKey'] = null): Message {
  return {
    number,
    user,
    apiKey,
    text: `Message ${number}`,
    mentionedUserIds: [],
    files: [],
    deletedAt: null,
    createdAt: new Date(START + minutes * 60_000).toISOString()
  };
}

/** The day of a time in UTC, so that the test says the same wherever it runs */
const utcDay = (time: string) => time.slice(0, 10);

/** What a layout comes to, in short: the number of each message, * for a head, after what stands above it */
function short(messages: Message[], firstUnread: number | null): string {
  return layOut(messages, firstUnread, utcDay)
    .flatMap((item) => [
      ...(item.newDay ? ['day'] : []),
      ...(item.firstUnread ? ['unread'] : []),
      `${item.message.number}${item.head ? '*' : ''}`
    ])
    .join(' ');
}

test('messages of one sender that follow each other closely are a run; another sender, or a pause, begins a new one', () => {
  assert.equal(RUN_GAP_MS, 5 * 60_000);
  assert.equal(short([], 0), '');
  assert.equal(
    short(
      [
        message(1, 0),
        message(2, 1),
        // Exactly the gap is still the same run; more is not
        message(3, 6),
        message(4, 12),
        message(5, 13, LINUS),
        message(6, 14, LINUS),
        message(7, 15)
      ],
      null
    ),
    'day 1* 2 3 4* 5* 6 7*'
  );
});

test('what an agent sent for a person is not in a run with what that person sent, nor with what another key of theirs sent', () => {
  assert.equal(
    short(
      [
        message(1, 0),
        message(2, 1, GRACE, AGENT),
        message(3, 2, GRACE, AGENT),
        message(4, 3, GRACE, { id: 'k-2', name: 'Writer' }),
        message(5, 4)
      ],
      null
    ),
    'day 1* 2* 3 4* 5*'
  );
});

test('a new day is marked above its first message, which begins a run', () => {
  const day = 24 * 60;
  assert.equal(short([message(1, 0), message(2, 1), message(3, day), message(4, day + 1)], null), 'day 1* 2 day 3* 4');
});

test('a line is put above the first message the person had not read, which begins a run', () => {
  const messages = [message(1, 0), message(2, 1), message(3, 2), message(4, 3)];

  assert.equal(short(messages, 3), 'day 1* 2 unread 3* 4');
  assert.equal(short(messages, 1), 'day unread 1* 2 3 4');
  // Nothing unread
  assert.equal(short(messages, null), 'day 1* 2 3 4');
  // The first unread message is not sent yet
  assert.equal(short(messages, 5), 'day 1* 2 3 4');
  // On a new day the day comes first
  assert.equal(short([message(1, 0), message(2, 24 * 60)], 2), 'day 1* day unread 2*');
});

test('when what is new began before the messages the page holds, the line is above the first one it holds, and moves when earlier ones are shown', () => {
  const messages = [message(1, 0), message(2, 1), message(3, 2), message(4, 3), message(5, 4), message(6, 5)];

  // Read up to 1, and the page holds 4 to 6: everything it holds is new
  assert.equal(short(messages.slice(3), 2), 'day unread 4* 5 6');
  // Earlier ones are shown, still not back to the first unread: the line is above the first of them
  assert.equal(short(messages.slice(2), 2), 'day unread 3* 4 5 6');
  // With the first unread on the page the line is there, once
  assert.equal(short(messages, 2), 'day 1* unread 2* 3 4 5 6');
});
