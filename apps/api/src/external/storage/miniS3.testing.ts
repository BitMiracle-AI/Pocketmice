// A small S3 for the tests of the storage: the requests s3Storage.ts sends, answered over real HTTP from memory.
// The real SDK talks to it, so what the tests pin is what the SDK puts on the wire, not a stand-in's idea of it.
// It is not a test, and nothing a running server uses imports it.
// Who is calling is not checked: the tests are about the requests, not the signature.
// Two things it is strict about, on purpose, as S3-compatible services that are not AWS are (see s3Storage.ts):
// an upload that brings a checksum in the SDK's own form is refused, and so is an address that says what type the
// answer is to have (response-content-type), which Alibaba Cloud OSS refuses at its own domain.
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MiniS3 {
  /** http://127.0.0.1:<port>: the endpoint to give the storage, with path style */
  url: string;
  /** What is stored now, by "<bucket>/<key>" */
  objects: Map<string, Buffer>;
  /** The uploads in parts that were begun and neither completed nor taken back, by upload id */
  uploads: Map<string, Map<number, Buffer>>;
  close: () => Promise<void>;
}

function error(res: ServerResponse, status: number, code: string): void {
  res.writeHead(status, { 'content-type': 'application/xml' });
  res.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`);
}

function xml(res: ServerResponse, body: string): void {
  res.writeHead(200, { 'content-type': 'application/xml' });
  res.end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
}

async function bodyOf(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Whether an upload brings a checksum in the SDK's own form */
function bringsChecksum(req: IncomingMessage): boolean {
  if (String(req.headers['content-encoding'] ?? '').includes('aws-chunked')) return true;
  return Object.keys(req.headers).some(
    (name) => name === 'x-amz-trailer' || name === 'x-amz-sdk-checksum-algorithm' || name.startsWith('x-amz-checksum-')
  );
}

export async function startMiniS3(): Promise<MiniS3> {
  const objects = new Map<string, Buffer>();
  const uploads = new Map<string, Map<number, Buffer>>();
  /** The type each object was stored with, and the type each upload in parts was begun with */
  const types = new Map<string, string>();
  const typesBegun = new Map<string, string>();
  /** The type an upload says its object has. S3 stores one of its own when none is said */
  const typeOf = (req: IncomingMessage) => req.headers['content-type'] ?? 'binary/octet-stream';

  async function answer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://mini-s3');
    // Path style: /<bucket>/<key>
    const name = decodeURIComponent(url.pathname.slice(1));
    const uploadId = url.searchParams.get('uploadId');
    const parts = uploadId === null ? undefined : uploads.get(uploadId);

    if (req.method === 'PUT') {
      const source = req.headers['x-amz-copy-source'];
      if (typeof source === 'string') {
        const copied = objects.get(decodeURIComponent(source).replace(/^\//, ''));
        if (!copied) return error(res, 404, 'NoSuchKey');
        objects.set(name, copied);
        types.set(name, types.get(decodeURIComponent(source).replace(/^\//, '')) ?? 'binary/octet-stream');
        return xml(res, '<CopyObjectResult><ETag>"copy"</ETag></CopyObjectResult>');
      }
      if (bringsChecksum(req)) return error(res, 400, 'InvalidArgument');
      const body = await bodyOf(req);
      if (uploadId === null) {
        objects.set(name, body);
        types.set(name, typeOf(req));
      } else if (parts) parts.set(Number(url.searchParams.get('partNumber')), body);
      else return error(res, 404, 'NoSuchUpload');
      res.writeHead(200, { etag: '"part"' });
      return void res.end();
    }

    if (req.method === 'POST' && url.searchParams.has('uploads')) {
      const id = randomUUID();
      uploads.set(id, new Map());
      typesBegun.set(id, typeOf(req));
      return xml(res, `<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
    }
    if (req.method === 'POST' && uploadId !== null) {
      if (!parts) return error(res, 404, 'NoSuchUpload');
      await bodyOf(req);
      const inOrder = [...parts.entries()].sort(([a], [b]) => a - b).map(([, part]) => part);
      objects.set(name, Buffer.concat(inOrder));
      types.set(name, typesBegun.get(uploadId) ?? 'binary/octet-stream');
      uploads.delete(uploadId);
      typesBegun.delete(uploadId);
      return xml(res, '<CompleteMultipartUploadResult><ETag>"whole"</ETag></CompleteMultipartUploadResult>');
    }

    if (req.method === 'GET') {
      const object = objects.get(name);
      if (!object) return error(res, 404, 'NoSuchKey');
      if (url.searchParams.has('response-content-type')) return error(res, 400, 'InvalidRequest');
      // The type the object was stored with, and the name to save under when the address carries one, as a signed
      // address does (response-content-disposition)
      const said: Record<string, string> = { 'content-type': types.get(name) ?? 'binary/octet-stream' };
      const disposition = url.searchParams.get('response-content-disposition');
      if (disposition !== null) said['content-disposition'] = disposition;
      const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
      if (!range) {
        res.writeHead(200, { ...said, 'content-length': object.length });
        return void res.end(object);
      }
      const piece = object.subarray(Number(range[1]), Number(range[2]) + 1);
      res.writeHead(206, {
        ...said,
        'content-length': piece.length,
        'content-range': `bytes ${range[1]}-${range[2]}/${object.length}`
      });
      return void res.end(piece);
    }

    if (req.method === 'DELETE') {
      if (uploadId === null) {
        objects.delete(name);
        types.delete(name);
      } else {
        uploads.delete(uploadId);
        typesBegun.delete(uploadId);
      }
      res.writeHead(204);
      return void res.end();
    }

    error(res, 400, 'NotImplemented');
  }

  const server = createServer((req, res) => {
    answer(req, res).catch(() => res.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    objects,
    uploads,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      })
  };
}
