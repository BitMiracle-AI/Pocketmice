/** Reads an environment variable that must be set. A missing one is an error: there is no default */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See apps/api/.env.example.`);
  return value;
}

/**
 * Reads a list of web origins, separated by commas. Each must be written the way a browser reports an origin:
 * scheme, host and port, with no path and no trailing slash.
 * A wrong spelling is an error here. Otherwise it would never match what a browser reports, and the symptom would
 * be every request from the web page failing while the server logs nothing.
 */
export function requireOrigins(name: string): string[] {
  return requireEnv(name)
    .split(',')
    .map((item) => {
      const origin = item.trim();
      if (!URL.canParse(origin) || new URL(origin).origin !== origin) {
        throw new Error(
          `Environment variable ${name} has an invalid origin "${origin}". Write it like http://localhost:11211, with no path and no trailing slash.`
        );
      }
      return origin;
    });
}

/**
 * Reads an optional port number: fallback when it is not set. Set to anything but a whole number from 1 to 65535
 * is an error.
 */
export function portFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Environment variable ${name} must be a port number between 1 and 65535, got "${value}".`);
  }
  return port;
}

/** Where the bytes of files are kept: a folder on this machine, or a bucket of an S3-compatible service */
export type StorageConfig =
  | { kind: 'folder'; dir: string }
  | {
      kind: 's3';
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      /** The address of the service. Left out for AWS, which is found from the region */
      endpoint?: string;
      /** Whether the bucket is named in the path of the address and not in its host */
      forcePathStyle: boolean;
    };

/**
 * Reads where the bytes of files are kept. Exactly one of the two is configured: STORAGE_DIR for a folder, or
 * S3_BUCKET with the rest of its group for a bucket. Both, or neither, is an error: the server never guesses where
 * people's files go, and never falls back on a place nobody chose.
 */
export function storageFromEnv(): StorageConfig {
  const dir = process.env.STORAGE_DIR;
  const bucket = process.env.S3_BUCKET;
  if (dir && bucket) {
    throw new Error('Both STORAGE_DIR and S3_BUCKET are set. Set one: files are kept in one place.');
  }
  if (dir) return { kind: 'folder', dir };
  if (!bucket) {
    throw new Error('Neither STORAGE_DIR nor S3_BUCKET is set. Set one: see apps/api/.env.example.');
  }

  const pathStyle = process.env.S3_FORCE_PATH_STYLE;
  if (pathStyle && pathStyle !== 'true' && pathStyle !== 'false') {
    throw new Error(`Environment variable S3_FORCE_PATH_STYLE must be true or false, got "${pathStyle}".`);
  }
  const endpoint = process.env.S3_ENDPOINT;
  // Written without its scheme, localhost:9000 still reads as an address: one whose scheme is "localhost"
  if (endpoint && !(URL.canParse(endpoint) && /^https?:$/.test(new URL(endpoint).protocol))) {
    throw new Error(
      `Environment variable S3_ENDPOINT is not an address: "${endpoint}". Write it with its scheme, like http://localhost:9000.`
    );
  }
  return {
    kind: 's3',
    bucket,
    region: requireEnv('S3_REGION'),
    accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    ...(endpoint && { endpoint }),
    forcePathStyle: pathStyle === 'true'
  };
}
