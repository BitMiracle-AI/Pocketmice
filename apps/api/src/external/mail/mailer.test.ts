import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createSmtpMailer, printEmail } from './mailer.ts';
import { type MiniSmtp, startMiniSmtp } from './miniSmtp.testing.ts';

// The mailer for real, against a small SMTP server of this file (see miniSmtp.testing.ts).
const FROM = 'Pocketmice <noreply@pocketmice.example>';
const MAIL = { to: 'ada@example.com', subject: 'Your sign-in code', text: 'Your sign-in code is 123456.' };

let smtp: MiniSmtp;

before(async () => {
  smtp = await startMiniSmtp();
});

after(async () => {
  await smtp.close();
});

test('a mail goes to the server: from the configured sender, to the one recipient, with its subject and its text', async () => {
  const send = createSmtpMailer({ url: smtp.url, from: FROM });

  await send(MAIL);

  const [mail] = smtp.mails.splice(0);
  assert.ok(mail);
  // What the server is told, and what the person reading the mail sees
  assert.equal(mail.from, 'noreply@pocketmice.example');
  assert.deepEqual(mail.to, ['ada@example.com']);
  assert.match(mail.message, /^From: Pocketmice <noreply@pocketmice\.example>\r$/m);
  assert.match(mail.message, /^To: ada@example\.com\r$/m);
  assert.match(mail.message, /^Subject: Your sign-in code\r$/m);
  assert.match(mail.message, /\r\n\r\nYour sign-in code is 123456\.$/);
  assert.equal(mail.account, null);
});

test('an address with an account in it signs in as that account, also when the password has characters of an address', async () => {
  const send = createSmtpMailer({ url: smtp.urlAs('mailer@example.com', 'p@ss:w/rd?'), from: FROM });

  await send(MAIL);

  const [mail] = smtp.mails.splice(0);
  assert.deepEqual(mail?.account, { user: 'mailer@example.com', password: 'p@ss:w/rd?' });
});

test('a mail the server does not take throws: the recipient is refused, the server cannot be reached, or it does not answer in time', async () => {
  const refusing = await startMiniSmtp();
  refusing.refuseRecipients();
  await assert.rejects(createSmtpMailer({ url: refusing.url, from: FROM })(MAIL));
  assert.deepEqual(refusing.mails, []);
  await refusing.close();

  // Nothing listens there any more
  await assert.rejects(createSmtpMailer({ url: refusing.url, from: FROM })(MAIL));

  const silent = await startMiniSmtp();
  silent.goSilent();
  const started = Date.now();
  await assert.rejects(createSmtpMailer({ url: silent.url, from: FROM, timeoutMs: 300 })(MAIL));
  assert.ok(Date.now() - started < 5_000, 'the mailer should give up when its time is over');
  assert.deepEqual(silent.mails, []);
  await silent.close();
});

test('a mail that is printed goes to the output with its recipient, its subject and its text, and nowhere else', async (t) => {
  const printed: unknown[][] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args);
  });

  await printEmail(MAIL);

  assert.deepEqual(printed, [
    ['[mail not sent] To: ada@example.com\nSubject: Your sign-in code\n\nYour sign-in code is 123456.']
  ]);
  assert.deepEqual(smtp.mails, []);
});
