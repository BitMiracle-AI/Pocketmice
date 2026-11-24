import {
  type ApiKeyPermission,
  apiKeyName,
  createApiKey,
  deleteApiKey,
  getApiKeys
} from '@pocketmice/contract/domains/apiKey';
import type { OutputOf } from '@pocketmice/contract/operation';
import { call, failureText, queryClient, readQuery } from '@/lib/api';
import { apiKeyText } from './text';

// The person's API keys: what an agent calls the api with. A key belongs to the person and to no space. The key
// itself comes with every answer: whoever made a key can copy it again whenever they are signed in.

/** A key, as the person who made it sees it: the key itself included */
export type ApiKey = OutputOf<typeof getApiKeys>['apiKeys'][number];

/** The person's keys that work, the oldest first */
export const apiKeysQuery = readQuery(getApiKeys, {});

/** A key as it is written while it is not shown: by its first and last characters, which tell it from the others */
export function hiddenKey(key: string): string {
  return `${key.slice(0, 3)}${'•'.repeat(12)}${key.slice(-4)}`;
}

/** Makes a key. Answers with it, which is in the list from then on; or with the sentence that says why not */
export async function makeApiKey(
  name: string,
  permission: ApiKeyPermission
): Promise<{ apiKey: ApiKey } | { problem: string }> {
  const checked = apiKeyName.safeParse(name);
  if (!checked.success) return { problem: apiKeyText.nameMissing };

  const result = await call(createApiKey, { name: checked.data, permission });
  if (!result.ok) return { problem: failureText(result.code, {}) };

  const { apiKey } = result.data;
  queryClient.setQueryData(apiKeysQuery.queryKey, (old) => (old ? { apiKeys: [...old.apiKeys, apiKey] } : old));
  void queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey });
  return { apiKey };
}

/**
 * Deletes a key. Null when it is gone, or the sentence that says why it is not. A key that turns out to have been
 * deleted before (in another tab, say) is gone too, which is what was asked for.
 */
export async function removeApiKey(apiKeyId: string): Promise<string | null> {
  const result = await call(deleteApiKey, { apiKeyId });
  if (!result.ok && result.code !== 'NOT_FOUND') return failureText(result.code, {});

  queryClient.setQueryData(apiKeysQuery.queryKey, (old) =>
    old ? { apiKeys: old.apiKeys.filter((each) => each.id !== apiKeyId) } : old
  );
  void queryClient.invalidateQueries({ queryKey: apiKeysQuery.queryKey });
  return null;
}
