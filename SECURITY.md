# Security policy

Pocketmice keeps other people's files, and the API keys their agents call with. A report of a way around what it
promises is the most useful thing this project can be given.

## Reporting a vulnerability

**Do not open a public issue for a security problem.** A public issue tells everyone who runs a server, and
everyone else, before there is a fix.

Use GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/BitMiracle-AI/Pocketmice/security/advisories/new). It opens a
thread that only you and the maintainers read.

You can expect an answer within 7 days. Pocketmice is early and not ready for production, so there is no formal
SLA and no bug bounty. A security report comes before feature work, and you are credited in the advisory unless you
would rather not be.

## What counts

Anything that breaks what the [README](README.md) says the server does. For example:

- **Getting in without being let in.** Reading or changing what is in a space without being a member of it, or
  calling the API as a person without their session or one of their API keys.
- **Doing more than a role or a key allows.** A viewer changing something, a read-only key writing, or any key
  doing what only the person does: making or reading keys, deciding who gets into a space, deleting for good.
- **Losing what is promised to stay.** Content written over without naming the version being replaced, or a
  version or a trashed file destroyed by anyone but the owner of the space, signed in themselves.
- **Signing in.** Signing in as someone else, or getting past the limits on sign-in attempts and sign-in codes on
  a server whose reverse proxy is set up as the README says.
- **The machine the server runs on.** Reading or writing a file outside the storage the server was given, or a
  credential of the server (the session secret, the database, the bucket's key) reaching a caller.

## What is by design

These are written down as how Pocketmice works. A report that one of them is so changes nothing; a reason why one
of them should not be so is welcome, as an ordinary issue.

- **The database holds each API key as it is**, so that the person who made a key can copy it again. Reading the
  keys takes reading the database, which the README says to keep the way a credential is kept.
- **An invite link lets in whoever holds it** until it expires or the owner of the space deletes it, someone the
  owner has since removed included.
- **A server that sends no mail does not prove who an email address belongs to.** People sign up there with an
  address and a password, and nothing is sent to the address.

A vulnerability in something Pocketmice is built on (Node, Postgres, the sign-in library, an S3 service) belongs
with that project. If Pocketmice uses it in a way that is not safe, that is ours, and we want to know.

## Supported versions

There is no release yet. Fixes go to `main`.
