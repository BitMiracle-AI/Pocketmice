// The few lines in index.html that decide whether the page opens dark, held against the rule in theme.ts.
// To run it, in apps/app: node --test src/lib/theme.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { isDark, THEME_STORAGE_KEY, THEMES } from './theme.ts';

/** The script in index.html that sets the class, as it is written there */
function scriptOfIndexHtml(): string {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '');
  assert.equal(scripts.length, 1, 'index.html has one script written into it');
  return scripts[0] ?? '';
}

/**
 * Runs that script in a page made up for it: one where the browser keeps what `kept` holds, and the system is dark
 * or not. Returns whether the script made the page dark.
 */
function opensDark(kept: Record<string, string> | 'refused', systemDark: boolean): boolean {
  let dark = false;
  runInNewContext(scriptOfIndexHtml(), {
    matchMedia: (query: string) => {
      assert.equal(query, '(prefers-color-scheme: dark)');
      return { matches: systemDark };
    },
    localStorage: {
      getItem(key: string) {
        if (kept === 'refused') throw new Error('The browser does not let the page keep anything.');
        return kept[key] ?? null;
      }
    },
    document: {
      documentElement: {
        classList: {
          toggle(name: string, on: boolean) {
            assert.equal(name, 'dark');
            dark = on;
          }
        }
      }
    }
  });
  return dark;
}

test('index.html opens the page dark exactly when the rule says so, for every choice and either system', () => {
  for (const chosen of THEMES) {
    for (const systemDark of [false, true]) {
      const kept: Record<string, string> = chosen === 'system' ? {} : { [THEME_STORAGE_KEY]: chosen };
      assert.equal(opensDark(kept, systemDark), isDark(chosen, systemDark), `${chosen}, system dark: ${systemDark}`);
    }
  }
});

test('index.html reads the choice under the name theme.ts keeps it under, and no other', () => {
  assert.equal(opensDark({ theme: 'dark', 'pocketmice.language': 'dark' }, false), false);
  assert.equal(opensDark({ [THEME_STORAGE_KEY]: 'dark' }, false), true);
});

test('what is kept and is no choice counts as nothing kept: the page follows the system', () => {
  assert.equal(opensDark({ [THEME_STORAGE_KEY]: 'system' }, true), true);
  assert.equal(opensDark({ [THEME_STORAGE_KEY]: 'blue' }, false), false);
  assert.equal(opensDark({ [THEME_STORAGE_KEY]: 'blue' }, true), true);
});

test('a browser that does not let the page keep anything follows the system', () => {
  assert.equal(opensDark('refused', true), true);
  assert.equal(opensDark('refused', false), false);
});
