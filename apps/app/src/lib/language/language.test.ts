// Which of our languages a browser gets. To run it, in apps/app: node --test src/lib/language/language.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { language, languageOf } from './language.ts';
import { LANGUAGES, languageTag } from './languages.ts';

test('a region is not looked at, and every Chinese is Simplified Chinese', () => {
  assert.equal(languageOf(['en-US', 'en']), 'en');
  assert.equal(languageOf(['en-GB']), 'en');
  assert.equal(languageOf(['zh-CN', 'zh', 'en']), 'zh-hans');
  assert.equal(languageOf(['zh-TW']), 'zh-hans');
  assert.equal(languageOf(['zh-Hans-CN']), 'zh-hans');
  assert.equal(languageOf(['ZH']), 'zh-hans');
});

test('the first language the browser asks for that we have is the one', () => {
  assert.equal(languageOf(['ja', 'zh-CN', 'en']), 'zh-hans');
  assert.equal(languageOf(['fr-FR', 'en-US']), 'en');
});

test('a browser that asks for none of ours gets English', () => {
  assert.equal(languageOf(['fr-FR']), 'en');
  assert.equal(languageOf([]), 'en');
  // Only the part before the region is compared, and as a whole
  assert.equal(languageOf(['zhx']), 'en');
});

test('outside a browser the language is English', () => {
  assert.equal(language, 'en');
});

test('a language is written into the page the way the standards write it', () => {
  assert.deepEqual(
    LANGUAGES.map((each) => languageTag(each)),
    ['en', 'zh-Hans']
  );
});
