import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { describeError } from './errorLog.ts';

/**
 * An error shaped like the "query failed" a database library raises: the message is the statement followed by the
 * parameters, and query and params are attached as well.
 */
class DrizzleQueryError extends Error {
  query: string;
  params: unknown[];
  constructor(query: string, params: unknown[], cause?: Error) {
    super(`Failed query: ${query}\nparams: ${params}`, { cause });
    this.query = query;
    this.params = params;
  }
}

test('a failed query: the SQL and the database error code are written, the parameters and the duplicated value are not', () => {
  const duplicate = Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), {
    name: 'PostgresError',
    code: '23505',
    detail: 'Key (email)=(ada@example.com) already exists.'
  });
  const failed = new DrizzleQueryError('insert into "users" ("email") values ($1)', ['ada@example.com'], duplicate);
  // Printed as it is, the value is in there
  assert.match(inspect(failed, { depth: 10 }), /ada@example\.com/);

  const described = describeError(failed);

  assert.match(described, /^DrizzleQueryError: Failed query: insert into "users" \("email"\) values \(\$1\)\n/);
  assert.match(described, /Caused by: PostgresError: duplicate key value violates .* \(code 23505\)/);
  assert.doesNotMatch(described, /ada@example\.com|params/);
  // Where it happened is still there
  assert.match(described, /\n\s+at /);
});

test('a failed query is recognised by its shape: under another class name its parameters are still not written', () => {
  const failed = Object.assign(new Error('Failed query: select 1 where "token" = $1\nparams: secret-token'), {
    query: 'select 1 where "token" = $1',
    params: ['secret-token']
  });

  assert.match(describeError(failed), /^Error: Failed query: select 1 where "token" = \$1\n/);
  assert.doesNotMatch(describeError(failed), /secret-token/);
});

test('a parameter with a line starting with "at ": it is not written as a position, the real positions are', () => {
  // The parameters follow the message and can run over several lines. Picking positions by "starts with at" alone
  // would log this line and the parameters after it
  const failed = new DrizzleQueryError('insert into "api_keys" ("label", "secret") values ($1, $2)', [
    'the key\n  at the office',
    'pm-the-secret-key'
  ]);

  const described = describeError(failed);

  assert.doesNotMatch(described, /pm-the-secret-key|the office/);
  assert.match(described, /\n\s+at .*errorLog\.test\.ts/, 'the real position should still be there');
});

test('a message changed after the stack was written: no positions, so no line of the old message passes for one', () => {
  const failed = new Error('first message\n  at the office,pm-the-secret-key');
  // The stack is written out as text the first time it is read, with the message of that moment: read it once,
  // then change the message
  assert.match(failed.stack ?? '', /first message/);
  failed.message = 'changed later';

  const described = describeError(failed);

  assert.equal(described, 'Error: changed later');
});

test('a very long statement: only its beginning is written, followed by how much more there is', () => {
  const rows = Array.from({ length: 50_000 }, (_, i) => `($${i + 1})`).join(', ');
  const query = `insert into "files" ("id") values ${rows}`;
  const failed = new DrizzleQueryError(query, ['a-value']);

  const [first = ''] = describeError(failed).split('\n');

  assert.ok(first.startsWith('DrizzleQueryError: Failed query: insert into "files" ("id") values ($1), ($2)'));
  assert.ok(first.endsWith(`[${query.length - 1000} more characters]`));
  assert.ok(first.length < 1100, `the first line has ${first.length} characters`);
});

test('any other error: name, message, code and position are all there; a class of its own goes by its own name', () => {
  class OwnFailure extends Error {}
  const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });

  assert.match(describeError(new TypeError('x is not a function')), /^TypeError: x is not a function\n\s+at /);
  assert.match(describeError(new OwnFailure('it broke')), /^OwnFailure: it broke\n/);
  assert.match(describeError(refused), /^Error: connect ECONNREFUSED 127\.0\.0\.1:5432 \(code ECONNREFUSED\)\n/);
});

test('what was thrown is not an error: it is still written; causes are followed a few levels down, not for ever', () => {
  assert.equal(describeError('just a sentence'), 'just a sentence');
  assert.equal(describeError({ reason: 'object' }), "{ reason: 'object' }");

  const loop = new Error('goes round');
  loop.cause = loop;
  assert.equal(describeError(loop).match(/goes round/g)?.length, 6);
});
