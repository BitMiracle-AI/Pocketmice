// A small SMTP server for the tests of the mailer: it takes the mails mailer.ts sends, over a real connection, and
// keeps them in memory. The real client talks to it, so what the tests pin is what the client puts on the wire.
// It is not a test, and nothing a running server uses imports it.
// It speaks only what one mail needs (EHLO, AUTH PLAIN, MAIL, RCPT, DATA, QUIT), without encryption.
import { type AddressInfo, createServer, type Socket } from 'node:net';

export interface ReceivedMail {
  /** The account the client signed in as; null when it did not sign in */
  account: { user: string; password: string } | null;
  /** The sender and the recipients the client named to the server */
  from: string;
  to: string[];
  /** The mail itself as it was sent: its headers, an empty line, its text */
  message: string;
}

export interface MiniSmtp {
  /** smtp://127.0.0.1:<port>: the address to give the mailer. Put an account in front of the host to sign in */
  url: string;
  /** The same server with an account to sign in as */
  urlAs: (user: string, password: string) => string;
  /** The mails that arrived, the oldest first */
  mails: ReceivedMail[];
  /** Every recipient is refused from now on, the way a server refuses an address it does not deliver to */
  refuseRecipients: () => void;
  /** The server greets, and from then on says nothing: a mail never gets through */
  goSilent: () => void;
  close: () => Promise<void>;
}

/** The address between the angle brackets of a MAIL or RCPT command */
function addressIn(line: string): string {
  return /<([^>]*)>/.exec(line)?.[1] ?? '';
}

/** Starts a server on a free port of this machine */
export async function startMiniSmtp(): Promise<MiniSmtp> {
  const mails: ReceivedMail[] = [];
  const sockets = new Set<Socket>();
  let refusing = false;
  let silent = false;

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setEncoding('utf8');

    let buffer = '';
    let mail: ReceivedMail = { account: null, from: '', to: [], message: '' };
    /** Whether the client is sending the mail itself, which ends with a line that holds a single dot */
    let inData = false;
    const say = (line: string) => socket.write(`${line}\r\n`);

    function command(line: string): void {
      const verb = line.split(' ')[0]?.toUpperCase();
      if (verb === 'EHLO') {
        say('250-mini.smtp');
        say('250 AUTH PLAIN');
      } else if (verb === 'AUTH') {
        // AUTH PLAIN <base64 of "\0user\0password">
        const [, user = '', password = ''] = Buffer.from(line.split(' ')[2] ?? '', 'base64')
          .toString()
          .split('\0');
        mail.account = { user, password };
        say('235 signed in');
      } else if (verb === 'MAIL') {
        mail.from = addressIn(line);
        say('250 ok');
      } else if (verb === 'RCPT') {
        if (refusing) {
          say('550 no such mailbox');
        } else {
          mail.to.push(addressIn(line));
          say('250 ok');
        }
      } else if (verb === 'DATA') {
        inData = true;
        say('354 go on');
      } else if (verb === 'QUIT') {
        say('221 bye');
        socket.end();
      } else {
        say('250 ok');
      }
    }

    socket.on('data', (chunk: string) => {
      if (silent) return;
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          // A line of the mail that begins with a dot was sent with one more in front
          mail.message = buffer.slice(0, end).replaceAll('\r\n..', '\r\n.');
          buffer = buffer.slice(end + 5);
          mails.push(mail);
          mail = { account: mail.account, from: '', to: [], message: '' };
          inData = false;
          say('250 taken');
        } else {
          const end = buffer.indexOf('\r\n');
          if (end === -1) return;
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          command(line);
        }
      }
    });

    say('220 mini.smtp');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `smtp://127.0.0.1:${port}`,
    urlAs: (user, password) => `smtp://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}`,
    mails,
    refuseRecipients() {
      refusing = true;
    },
    goSilent() {
      silent = true;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}
