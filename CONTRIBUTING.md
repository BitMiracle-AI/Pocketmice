# Contributing to Pocketmice

Pocketmice is early, and much of what it will be is not decided yet. Every choice about its design (a table, an
operation, what is promised to the people who use it) is talked through by the maintaining team before any code is
written, and the code follows from what was settled. A pull request comes the other way round: the choice is
already made, and all that is left is to take it or leave it.

For that reason **Pocketmice does not accept pull requests from outside the maintaining team.** That is how the
project is run, and no judgement of any patch. A pull request opened against this repository is closed with a
pointer to this document.

## What is welcome

**Issues.** A bug, a way to reproduce one, an objection to a design, something you need and do not find: these are
what moves the project. When you open one:

- Say what you ran, what you expected and what happened. A way to reproduce it on a fresh server is worth more than
  a diagnosis.
- If you have found the cause, say so. If you have a fix in mind, describe it in words or in a short snippet. A
  maintainer writes it, and credits you in the commit and in the issue.
- A security problem never goes in a public issue: see [SECURITY.md](SECURITY.md).

**Forks.** Pocketmice is Apache-2.0. If you need a change that is not made here, fork and carry it. If your fork
shows that something works, tell us in an issue.

---

The rest of this document is for the maintaining team, and for anyone who runs a fork.

## Setting up

What to install, the database and the first start are in the README, under
[Development](README.md#development).

## Checks and tests

- `pnpm check` must pass before every commit: formatting and lint, the checks of the repository's structure, and
  the type check. It runs no test.
- `pnpm check:all` adds every test. Run it once before a push, not for every commit: CI runs the same command on
  every push. The tests need the Postgres server of the README, and nothing else from outside.
- For a test file you wrote or changed, run that one file, from the folder of its package:

  ```sh
  cd apps/api && node --env-file-if-exists=.env --test src/domains/file/file.test.ts
  ```

- A check of the structure that fails says what is wrong and where the thing goes. The checks are in `scripts/`,
  and each says at its top why it is there.

## Code

- Everything in the repository is in English: code, comments, the names of tests, commit messages, documents, and
  what the programs print and throw.
- Formatting and lint are Biome's: `pnpm format` rewrites the files.
- How a part works is written in the comments of the file that owns it, not in a document of its own. What an
  operation does is written once, in the `description` of its definition in `packages/contract`.

## Commits

- One commit does one thing.
- The first line is a sentence that says what is true once the commit is in, with no type before it (`feat:`,
  `fix:`). The body says why, and what was tried.
