import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  codeSignInBody,
  requestSignInCode,
  signInBody,
  signInCode,
  signInEmail,
  signInPassword,
  signUpBody
} from './auth.ts';

test('an email address is trimmed and lowercased before it is checked', () => {
  assert.equal(signInEmail.parse('  Ada@Example.COM '), 'ada@example.com');
});

test('what is not an email address, or is longer than an address can be, is refused', () => {
  for (const wrong of ['', 'ada', 'ada@', '@example.com', 'ada@example', `${'a'.repeat(250)}@example.com`]) {
    assert.equal(signInEmail.safeParse(wrong).success, false, `"${wrong.slice(0, 20)}" should be refused`);
  }
});

test('a password is used as it is and held to the two lengths', () => {
  assert.equal(signInPassword.parse('  eight ch'), '  eight ch');
  assert.equal(signInPassword.safeParse('1234567').success, false);
  assert.equal(signInPassword.safeParse('a'.repeat(128)).success, true);
  assert.equal(signInPassword.safeParse('a'.repeat(129)).success, false);
});

test('signing up and signing in accept the fields written for them and no others', () => {
  const account = { name: 'Ada', email: 'ada@example.com', password: 'correct horse' };

  assert.deepEqual(signUpBody.parse(account), account);
  // The name follows the rule of a profile's name
  assert.equal(signUpBody.parse({ ...account, name: '  Ada Lovelace ' }).name, 'Ada Lovelace');
  assert.equal(signUpBody.safeParse({ ...account, name: '   ' }).success, false);
  assert.equal(signUpBody.safeParse({ ...account, image: 'https://example.com/a.png' }).success, false);
  assert.equal(signUpBody.safeParse({ email: account.email, password: account.password }).success, false);

  assert.equal(signInBody.safeParse({ email: account.email, password: account.password }).success, true);
  assert.equal(signInBody.safeParse({ ...account }).success, false);
  assert.equal(
    signInBody.safeParse({ email: account.email, password: account.password, rememberMe: false }).success,
    false
  );
  // A password shorter than a real one can be is passed on: the library answers it like any wrong password
  assert.equal(signInBody.safeParse({ email: account.email, password: 'short' }).success, true);
});

test('a sign-in code is six digits and nothing else', () => {
  assert.equal(signInCode.parse('012345'), '012345');
  for (const wrong of ['', '12345', '1234567', '12345a', ' 123456', '123 456', '１２３４５６']) {
    assert.equal(signInCode.safeParse(wrong).success, false, `"${wrong}" should be refused`);
  }
});

test('asking for a code and signing in with one write the address the same way, and accept no other field', () => {
  assert.deepEqual(requestSignInCode.input.parse({ email: '  Ada@Example.COM ' }), { email: 'ada@example.com' });
  assert.deepEqual(codeSignInBody.parse({ email: '  Ada@Example.COM ', otp: '123456' }), {
    email: 'ada@example.com',
    otp: '123456'
  });

  assert.equal(codeSignInBody.safeParse({ email: 'ada@example.com' }).success, false);
  assert.equal(codeSignInBody.safeParse({ email: 'ada@example.com', otp: '123456', name: 'Ada' }).success, false);
  assert.equal(codeSignInBody.safeParse({ email: 'ada@example.com', otp: '123456', image: 'x' }).success, false);
});
