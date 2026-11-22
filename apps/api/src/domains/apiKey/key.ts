import { randomBytes } from 'node:crypto';
import { API_KEY_PREFIX } from '@pocketmice/contract/domains/apiKey';

/** A new key: the prefix, then 32 random bytes written in the characters a URL is made of */
export function newKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString('base64url');
}
