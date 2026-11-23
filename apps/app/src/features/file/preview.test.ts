// To run it, in apps/app: node --test src/features/file/preview.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dataAddressOf,
  IMAGE_PREVIEW_MAX_BYTES,
  isMarkdown,
  isPdf,
  languageOf,
  PDF_PREVIEW_MAX_BYTES,
  previewOf,
  SVG_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_BYTES,
  textOf
} from './preview.ts';

test('a text is shown from its start, and is cut when it is longer than what is shown', () => {
  assert.deepEqual(previewOf('notes.md', 120), { kind: 'text', bytes: 120, cut: false });
  assert.deepEqual(previewOf('notes.md', TEXT_PREVIEW_BYTES), { kind: 'text', bytes: TEXT_PREVIEW_BYTES, cut: false });
  assert.deepEqual(previewOf('big.LOG', TEXT_PREVIEW_BYTES + 1), {
    kind: 'text',
    bytes: TEXT_PREVIEW_BYTES,
    cut: true
  });
});

test('a picture is shown whole, as the type its name says, unless it is too large to hold', () => {
  assert.deepEqual(previewOf('mark.PNG', 2048), { kind: 'image', type: 'image/png', scripted: false });
  assert.deepEqual(previewOf('photo.jpeg', IMAGE_PREVIEW_MAX_BYTES), {
    kind: 'image',
    type: 'image/jpeg',
    scripted: false
  });
  assert.deepEqual(previewOf('photo.jpg', IMAGE_PREVIEW_MAX_BYTES + 1), { kind: 'none', why: 'large' });
});

test('an SVG can carry a script: it is marked so, and has a smaller most', () => {
  assert.deepEqual(previewOf('drawing.svg', 300), { kind: 'image', type: 'image/svg+xml', scripted: true });
  assert.deepEqual(previewOf('map.SVG', SVG_PREVIEW_MAX_BYTES + 1), { kind: 'none', why: 'large' });
});

test('bytes are written out as a data: address, however many there are', () => {
  assert.equal(
    dataAddressOf(new TextEncoder().encode('<svg/>').buffer, 'image/svg+xml'),
    'data:image/svg+xml;base64,PHN2Zy8+'
  );
  const many = new Uint8Array(100_000).fill(65);
  const address = dataAddressOf(many.buffer, 'image/svg+xml');
  assert.equal(atob(address.slice(address.indexOf(',') + 1)), 'A'.repeat(100_000));
});

test('what the page does not draw has no preview, and neither has a file with nothing in it', () => {
  assert.deepEqual(previewOf('report.docx', 5000), { kind: 'none', why: 'kind' });
  assert.deepEqual(previewOf('README', 5000), { kind: 'none', why: 'kind' });
  assert.deepEqual(previewOf('.md', 5000), { kind: 'none', why: 'kind' });
  assert.deepEqual(previewOf('archive.tar.gz', 5000), { kind: 'none', why: 'kind' });
  assert.deepEqual(previewOf('empty.txt', 0), { kind: 'none', why: 'empty' });
  assert.deepEqual(previewOf('empty.png', 0), { kind: 'none', why: 'empty' });
  assert.deepEqual(previewOf('empty.pdf', 0), { kind: 'none', why: 'empty' });
  assert.deepEqual(previewOf('empty.zip', 0), { kind: 'none', why: 'kind' });
});

test('a PDF is shown by the reader the browser has, unless it is too large to hold', () => {
  assert.deepEqual(previewOf('Report.PDF', 5000), { kind: 'pdf' });
  assert.deepEqual(previewOf('scan.pdf', PDF_PREVIEW_MAX_BYTES), { kind: 'pdf' });
  assert.deepEqual(previewOf('scan.pdf', PDF_PREVIEW_MAX_BYTES + 1), { kind: 'none', why: 'large' });
});

test('what is handed to the reader of PDFs begins the way a PDF does', () => {
  assert.equal(isPdf(new TextEncoder().encode('%PDF-1.7\n%âãÏÓ').buffer), true);
  // A page of HTML under the name of a PDF, and bytes too few to say
  assert.equal(isPdf(new TextEncoder().encode('<html><script>alert(1)</script></html>').buffer), false);
  assert.equal(isPdf(new TextEncoder().encode('%PD').buffer), false);
  assert.equal(isPdf(new ArrayBuffer(0)), false);
});

test('a text is coloured as the language its name says, and one whose name says none is shown as it is', () => {
  assert.equal(languageOf('main.TS'), 'typescript');
  assert.equal(languageOf('page.tsx'), 'tsx');
  assert.equal(languageOf('data.yml'), 'yaml');
  assert.equal(languageOf('run.sh'), 'bash');
  assert.equal(languageOf('feed.xml'), 'html');
  assert.equal(languageOf('change.patch'), 'diff');
  assert.equal(languageOf('notes.txt'), null);
  assert.equal(languageOf('table.csv'), null);
  assert.equal(languageOf('Makefile'), null);
  // Every language named here is one a text can have: what is coloured is first of all shown
  for (const name of ['a.md', 'a.json', 'a.html', 'a.css', 'a.js', 'a.jsx', 'a.py', 'a.sql', 'a.diff']) {
    assert.equal(previewOf(name, 10).kind, 'text', name);
    assert.notEqual(languageOf(name), null, name);
  }
});

test('a text written in Markdown is told by its name', () => {
  assert.equal(isMarkdown('README.md'), true);
  assert.equal(isMarkdown('notes.MARKDOWN'), true);
  assert.equal(isMarkdown('notes.txt'), false);
  assert.equal(isMarkdown('md'), false);
});

test('a character the cut went through is left out of the text', () => {
  const whole = new TextEncoder().encode('预算');
  assert.equal(textOf(whole.buffer, false), '预算');
  // The second character is three bytes: the cut leaves two of them
  assert.equal(textOf(whole.slice(0, 5).buffer, true), '预');
  // A file that is all there is shown as it is, broken or not
  assert.equal(textOf(whole.slice(0, 5).buffer, false), '预�');
});
