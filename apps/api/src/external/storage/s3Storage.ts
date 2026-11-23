import type { Readable } from 'node:stream';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertKey, attachmentHeader, type FileStorage, MissingObject } from './fileStorage.ts';

export interface S3Options {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** The address of the service, scheme included. Left out for AWS, which is found from the region */
  endpoint?: string;
  /**
   * The address of the service as the callers of the api reach it, when that is not endpoint: a server that
   * reaches its bucket over the inner network of its provider gives the address the world reaches the bucket at.
   * Download addresses are signed for this one. Left out, they are signed for endpoint.
   */
  publicEndpoint?: string;
  /** Whether the bucket is named in the path of the address and not in its host. MinIO needs it */
  forcePathStyle: boolean;
  /** How many bytes a part of an upload is. Left out, PART_BYTES. The tests pass the smallest S3 allows */
  partBytes?: number;
}

/**
 * How many bytes of an upload are sent as one part. An object larger than this goes up in parts, and only this
 * many bytes times PARTS_AT_ONCE are in memory at any moment, however large the object is.
 */
const PART_BYTES = 8 * 1024 * 1024;

/** How many parts of one upload are sent at the same time */
const PARTS_AT_ONCE = 4;

/** How many objects are removed at the same time at most */
const REMOVALS_AT_ONCE = 32;

/** The type every object is stored with: bytes, which no browser shows as a page or runs */
const STORED_AS = 'application/octet-stream';

/** How long a connection to the service may take to open, and how long it may then stay silent, in milliseconds */
const CONNECT_MS = 10_000;
const SILENT_MS = 60_000;

function isNamed(error: unknown, ...names: string[]): boolean {
  return error instanceof Error && names.includes(error.name);
}

/**
 * The storage that is a bucket of an S3-compatible service: one object for each key. It is what more than one api
 * process, on more than one machine, can share.
 *
 * Two settings are deliberate. The SDK would by itself send a body with a checksum in a form of its own (in
 * chunks, the checksum after them), which services that are S3-compatible and not AWS refuse; asking for checksums
 * only when the service requires them turns that off. miniS3.testing.ts refuses those requests the same way, so
 * the tests fail if the setting is lost.
 * And nothing here sends a body that has to be hashed before it is sent: an upload goes up through Upload, which
 * takes the stream a part at a time and sends each part as bytes it holds. A stream handed to the SDK as it is
 * cannot be signed over plain http, which is how a MinIO on the same machine is reached.
 */
export function createS3Storage(options: S3Options): FileStorage {
  const { bucket } = options;
  const settings = {
    region: options.region,
    forcePathStyle: options.forcePathStyle,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    // Without these a service that stops answering is waited on for ever, and so is the request that waits for it
    requestHandler: { connectionTimeout: CONNECT_MS, socketTimeout: SILENT_MS }
  } as const;
  const client = new S3Client({ ...settings, ...(options.endpoint && { endpoint: options.endpoint }) });
  // An address is signed for the host it names. One that callers fetch from is signed by a client that names the
  // host they reach, which sends nothing itself
  const signer = options.publicEndpoint ? new S3Client({ ...settings, endpoint: options.publicEndpoint }) : client;

  return {
    async put(key, bytes) {
      assertKey(key);
      // When it fails, Upload takes back the parts that had arrived: nothing is left under the key
      await new Upload({
        client,
        // Every object is stored as bytes of no particular kind, whatever it holds: that is the type it is
        // handed out with, to whoever fetches it by a download address
        params: { Bucket: bucket, Key: key, Body: bytes, ContentType: STORED_AS },
        partSize: options.partBytes ?? PART_BYTES,
        queueSize: PARTS_AT_ONCE
      }).done();
    },

    async get(key, range) {
      assertKey(key);
      try {
        const answer = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ...(range && { Range: `bytes=${range.start}-${range.end}` })
          })
        );
        if (!answer.Body) throw new Error(`The storage answered for ${key} without a body.`);
        // In Node the body of an answer is a stream of Node's
        return answer.Body as Readable;
      } catch (error) {
        throw isNamed(error, 'NoSuchKey') ? new MissingObject(key) : error;
      }
    },

    async copy(from, to) {
      assertKey(from);
      assertKey(to);
      try {
        await client.send(new CopyObjectCommand({ Bucket: bucket, Key: to, CopySource: `${bucket}/${from}` }));
      } catch (error) {
        throw isNamed(error, 'NoSuchKey') ? new MissingObject(from) : error;
      }
    },

    async downloadUrl(key, { saveAs, seconds }) {
      assertKey(key);
      // The address carries the name to save under, and the signature covers it: changed by hand, the address is
      // refused. The type is not said here, it is the one the object was stored with (STORED_AS): a service may
      // refuse an address that says the type. Alibaba Cloud OSS does, at its own domain, with 400
      return getSignedUrl(
        signer,
        new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: attachmentHeader(saveAs) }),
        { expiresIn: seconds }
      );
    },

    async delete(keys) {
      keys.forEach(assertKey);
      // One request for each object. The request that removes many at once must carry a checksum of its body, in a
      // form that differs between services; this one has no body. Removing what is not there is no error to S3
      for (let at = 0; at < keys.length; at += REMOVALS_AT_ONCE) {
        await Promise.all(
          keys
            .slice(at, at + REMOVALS_AT_ONCE)
            .map((key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })))
        );
      }
    }
  };
}
