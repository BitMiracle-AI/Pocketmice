import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiClient } from '@pocketmice/client/api';
import { requestSignInCode as definition } from '@pocketmice/contract/domains/auth';
import { createApp } from '../../app.ts';
import { describeError } from '../../http/errorLog.ts';
import {
  CODES_PER_ADDRESS_PER_DAY,
  CODES_PER_ADDRESS_PER_MINUTE,
  REQUESTS_PER_IP_PER_MINUTE,
  requestSignInCode
} from './requestSignInCode.ts';

// The operation by itself: its limits, and what it answers when the mail does not go out. The code is not made
// here and no mail is sent: sendCode is a stand-in. With the sign-in library and a mail, it is tested in
// auth.test.ts.
const WEB_ORIGIN = 'http://localhost:11211';
const MINUTE_MS = 60_000;

interface Options {
  /** Whether this server signs people in with a code. Left out, it does */
  codes?: boolean;
  /** What sending a code does. Left out, it works */
  send?: (email: string) => Promise<void>;
}

/** An api with this one operation. The addresses a code was sent to are collected in sent */
function setup({ codes = true, send }: Options = {}) {
  const sent: string[] = [];
  const reported: { error: unknown; where: string }[] = [];
  let time = 1_000_000;

  const app = createApp({
    auth: { handler: async () => new Response(null, { status: 404 }) },
    webOrigins: [WEB_ORIGIN],
    implementations: [
      requestSignInCode({
        signIn: codes
          ? {
              method: 'emailCode',
              sendCode: async (email) => {
                await send?.(email);
                sent.push(email);
              }
            }
          : { method: 'password' },
        now: () => time
      })
    ],
    // The operation is for anyone: nobody is asked who is calling
    identifyCaller: async () => ({ user: null }),
    spaceMembership: async () => null,
    reportError: (error, where) => reported.push({ error, where })
  });

  /** Asks for a code for this address from this IP, the way a web page does: 'sent', or the error code */
  async function ask(email: string, ip: string | null = '203.0.113.1') {
    const call = createApiClient({
      baseUrl: 'http://api.test',
      fetch: async (url, init) =>
        app.request(url, {
          ...init,
          headers: { ...init.headers, origin: WEB_ORIGIN, ...(ip !== null && { 'x-forwarded-for': ip }) }
        }),
      reportError: (error, name) => assert.fail(`the client reported ${describeError(error)} calling ${name}`)
    });
    const result = await call(definition, { email });
    return result.ok ? 'sent' : result.code;
  }

  return {
    ask,
    sent,
    reported,
    pass: (ms: number) => {
      time += ms;
    }
  };
}

test('asking for a code sends one to the address, written lowercase without the spaces around it', async () => {
  const { ask, sent, reported } = setup();

  assert.equal(await ask('  Ada@Example.COM '), 'sent');

  assert.deepEqual(sent, ['ada@example.com']);
  assert.deepEqual(reported, []);
});

test('what is not an email address is INVALID_INPUT, and nothing is sent', async () => {
  const { ask, sent } = setup();

  for (const wrong of ['', 'ada', 'ada@example']) assert.equal(await ask(wrong), 'INVALID_INPUT', wrong);

  assert.deepEqual(sent, []);
});

test('on a server that signs people in with a password, the operation is answered like one it does not have', async () => {
  const { ask, sent, reported } = setup({ codes: false });

  assert.equal(await ask('ada@example.com'), 'UNKNOWN_OPERATION');

  assert.deepEqual(sent, []);
  assert.deepEqual(reported, []);
});

test('an address is sent so many codes a minute, whatever IP asks and however it is spelled; another address is not affected', async () => {
  const { ask, sent, pass } = setup();
  let lastIp = 0;
  const nextIp = () => `198.51.100.${++lastIp}`;

  for (let i = 0; i < CODES_PER_ADDRESS_PER_MINUTE; i++) assert.equal(await ask('ada@example.com', nextIp()), 'sent');

  assert.equal(await ask('ada@example.com', nextIp()), 'TOO_MANY_REQUESTS');
  assert.equal(await ask('ADA@example.com', nextIp()), 'TOO_MANY_REQUESTS');
  assert.equal(sent.length, CODES_PER_ADDRESS_PER_MINUTE);
  assert.equal(await ask('grace@example.com', nextIp()), 'sent');

  pass(MINUTE_MS + 1);
  assert.equal(await ask('ada@example.com', nextIp()), 'sent');
});

test('an address is sent so many codes a day: then none until a day after the first of them', async () => {
  const { ask, sent, pass } = setup();

  for (let i = 0; i < CODES_PER_ADDRESS_PER_DAY; i++) {
    assert.equal(await ask('ada@example.com'), 'sent', `code ${i + 1} of the day`);
    pass(MINUTE_MS);
  }

  assert.equal(await ask('ada@example.com'), 'TOO_MANY_REQUESTS');
  pass(12 * 60 * MINUTE_MS);
  assert.equal(await ask('ada@example.com'), 'TOO_MANY_REQUESTS');
  assert.equal(sent.length, CODES_PER_ADDRESS_PER_DAY);

  pass(12 * 60 * MINUTE_MS);
  assert.equal(await ask('ada@example.com'), 'sent');
});

test('an IP asks for so many codes a minute, whatever the addresses; another IP is not affected', async () => {
  const { ask, sent, pass } = setup();
  let lastAddress = 0;
  const nextAddress = () => `person-${++lastAddress}@example.com`;

  for (let i = 0; i < REQUESTS_PER_IP_PER_MINUTE; i++) assert.equal(await ask(nextAddress(), '203.0.113.7'), 'sent');

  assert.equal(await ask(nextAddress(), '203.0.113.7'), 'TOO_MANY_REQUESTS');
  assert.equal(sent.length, REQUESTS_PER_IP_PER_MINUTE);
  assert.equal(await ask(nextAddress(), '203.0.113.8'), 'sent');

  pass(MINUTE_MS + 1);
  assert.equal(await ask(nextAddress(), '203.0.113.7'), 'sent');
});

test('the addresses of one IPv6 block count as one IP, and so do all requests whose IP cannot be told', async () => {
  const block = setup();
  for (let i = 0; i < REQUESTS_PER_IP_PER_MINUTE; i++) {
    assert.equal(await block.ask(`person-${i}@example.com`, `2001:db8:1:2::${(i + 1).toString(16)}`), 'sent');
  }
  assert.equal(await block.ask('one-more@example.com', '2001:db8:1:2:ffff::1'), 'TOO_MANY_REQUESTS');
  assert.equal(await block.ask('one-more@example.com', '2001:db8:1:3::1'), 'sent');

  const unknown = setup();
  for (let i = 0; i < REQUESTS_PER_IP_PER_MINUTE; i++) {
    assert.equal(await unknown.ask(`person-${i}@example.com`, null), 'sent');
  }
  assert.equal(await unknown.ask('one-more@example.com', null), 'TOO_MANY_REQUESTS');
  assert.equal(await unknown.ask('one-more@example.com', '203.0.113.9'), 'sent');
});

test('the mail does not go out: the caller gets CODE_NOT_SENT without the reason, which is reported, and asking again works', async () => {
  let down = true;
  const { ask, sent, reported } = setup({
    send: async () => {
      if (down) throw new Error('the mail server said no to mailer@example.com');
    }
  });

  assert.equal(await ask('ada@example.com'), 'CODE_NOT_SENT');

  assert.deepEqual(sent, []);
  assert.equal(reported.length, 1);
  assert.equal(reported[0]?.where, 'requestSignInCode');
  assert.match(String(reported[0]?.error), /the mail server said no/);

  down = false;
  assert.equal(await ask('ada@example.com'), 'sent');
  assert.deepEqual(sent, ['ada@example.com']);
});
