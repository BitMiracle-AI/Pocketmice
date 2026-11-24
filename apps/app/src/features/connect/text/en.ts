/** The sentences of the page that says how to connect an agent, in English. This file says which sentences there are */
export const en = {
  title: 'Connect an agent',

  keyTitle: '1. Pick a key',
  keyHint: 'Your agent calls Pocketmice with one of your keys. What it does is done as you, in every space you are in.',
  keyLabel: 'The key your agent gets',
  keyOption: (name: string, permission: string) => `${name} · ${permission}`,
  newKey: 'New key',
  noKeyTitle: 'No API keys yet',
  noKeyDescription: 'Create a key for your agent to call Pocketmice with.',

  messageTitle: '2. Send this to your agent',
  messageHint:
    'It tells an agent that can run commands where the Pocketmice skill is, which server to call, and with which key. Your key is in the message: send it to your own agent and to nobody else.',
  messageNeedsKey: 'The message carries a key. Create one first.',
  /**
   * What the person sends their agent, which is an agent's to read: skill is the address of the skill, and
   * variables are the two environment variables with their values, a line each.
   */
  message: (skill: string, variables: string) =>
    `Install this skill, and use it to work with the files of my Pocketmice drive:\n${skill}\n\nKeep these two as environment variables, so that your later sessions have them too:\n${variables}`,
  messageLabel: 'The message for your agent',
  copyFailed:
    'The browser did not let the message be copied. The key is shown now: select the message and copy it by hand.',

  tryTitle: '3. Try it',
  tryHint: 'Ask your agent something only the drive can answer.',
  tryPrompt: 'List my spaces in Pocketmice.',
  copyPrompt: 'Copy the question',
  promptCopyFailed: 'The browser did not let the question be copied. Select it and copy it by hand.'
};
