import type { ApiKeyPermission } from '@pocketmice/contract/domains/apiKey';

/** The sentences of the page of API keys, in English. This file says which sentences there are */
export const en = {
  title: 'API keys',
  intro:
    'An agent calls Pocketmice with one of your keys. What it does is done as you, in every space you are in. No key can manage members, invites or keys, or delete anything for good.',
  newKey: 'New key',
  permissions: { write: 'Read and write', read: 'Read only' } satisfies Record<ApiKeyPermission, string>,
  permissionHints: {
    write: 'Reads files and changes them.',
    read: 'Reads files, and changes nothing.'
  } satisfies Record<ApiKeyPermission, string>,
  created: (date: string) => `Created ${date}`,
  listLabel: 'Your API keys',
  copy: 'Copy',
  copied: 'Copied',
  copyKey: (name: string) => `Copy the key ${name}`,
  copyFailed: 'The browser did not let the key be copied. It is shown now: select it and copy it by hand.',
  more: (name: string) => `More about the key ${name}`,
  show: 'Show key',
  hide: 'Hide key',
  remove: 'Delete',
  deleteTitle: (name: string) => `Delete “${name}”?`,
  deleteDescription: 'Anything that uses this key stops working right away. A deleted key cannot be brought back.',
  cancel: 'Cancel',
  emptyTitle: 'No API keys yet',
  emptyDescription: 'Create a key and give it to your agent.',
  dialogTitle: 'New API key',
  nameLabel: 'Name',
  namePlaceholder: 'research-agent',
  nameHint: 'Shown next to every file this key writes.',
  nameMissing: 'Give the key a name.',
  permissionLabel: 'Permission',
  create: 'Create key',
  createdToast: (name: string) => `Created “${name}”`
};
