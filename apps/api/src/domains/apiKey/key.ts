import { createHash, randomBytes } from 'node:crypto';
import { API_KEY_PREFIX } from '@pocketmice/contract/domains/apiKey';

/** A new key: the prefix, then 32 random bytes written in the characters a URL is made of */
export function newKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString('base64url');
}

/**
 * What the database keeps of a key, and what a request's key is matched by: its SHA-256, in hex.
 * A plain hash is enough. The slow hashes made for passwords exist because a password can be guessed; a key is 32
 * random bytes, and cannot.
 */
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
