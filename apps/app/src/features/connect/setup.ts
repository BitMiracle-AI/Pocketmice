// What a person hands their agent for it to use the drive: where the skill is, the address of the server, and one
// of their keys. The skill (skills/pocketmice/SKILL.md, under "Connecting") says how an agent takes the last two:
// as two environment variables. What is here is a copy of that for the web app, and the test next to this file
// fails when the two disagree.

/** Where the skill is: its folder on GitHub, as released. An agent installs it from there, or reads it there */
export const SKILL_URL = 'https://github.com/BitMiracle-AI/Pocketmice/tree/main/skills/pocketmice';

/** The environment variable the skill reads the address of the server from */
export const URL_VARIABLE = 'POCKETMICE_URL';

/** The environment variable the skill reads the key from */
export const KEY_VARIABLE = 'POCKETMICE_API_KEY';

/** What stands where the key goes while the person has no key */
export const NO_KEY = 'pm_…';

/**
 * The two variables with their values, a line each, the way a shell and a settings file both write them.
 * apiUrl is the address the pages call the api at. The skill wants it with no slash at its end.
 */
export function variableLines(apiUrl: string, key: string): string {
  return `${URL_VARIABLE}=${apiUrl.replace(/\/+$/, '')}\n${KEY_VARIABLE}=${key}`;
}

/**
 * Of a person's keys, the oldest first, the one their agent gets: the one they picked while it is still theirs, or
 * else the newest. Null when they have none.
 */
export function keyToHand<Key extends { id: string }>(apiKeys: readonly Key[], pickedId: string | null): Key | null {
  return apiKeys.find((each) => each.id === pickedId) ?? apiKeys.at(-1) ?? null;
}
