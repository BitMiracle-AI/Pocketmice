// Checks the length of AGENTS.md: the whole file has a limit in characters, and so does each line.
// AGENTS.md holds the rules the maintainers' coding agents work by. It is an internal file that is not committed
// (it is in .gitignore), so a fresh clone does not have it: when the file is absent, this script says there is
// nothing to check and exits successfully.
// Why check the length: every session and every subtask reads the whole file before it starts.
// Why count characters, and per line as well: a limit on the number of lines does not hold. Once the lines are used
// up, new text is appended to the lines already there, so the line count stays the same while the file keeps
// growing, and the rules to follow end up buried in the middle of explanations of how some area works. Text that
// does not fit on one line is most likely explaining how an area works, and that belongs in the comments of that
// area's own code.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The most characters the whole file may have (line breaks are not counted) and the most one line may have.
 * A letter, a punctuation mark and a CJK character each count as one.
 */
export const LIMITS = { file: 12_000, line: 300 };

const WHERE_IT_GOES =
  'How an area works belongs in the comments of the file that owns it; here keep one sentence saying what it is and which file holds its rules.';

/**
 * Checks the content of AGENTS.md. Returns one message for each line over the line limit and one more if the whole
 * file is over its limit, or an empty array if nothing is.
 */
export function checkAgentsFile(text, { file = LIMITS.file, line = LIMITS.line } = {}) {
  const lengths = text.split('\n').map((content) => [...content].length);
  const total = lengths.reduce((sum, length) => sum + length, 0);

  const problems = lengths.flatMap((length, index) =>
    length > line
      ? [
          `AGENTS.md line ${index + 1} has ${length} characters, over the limit of ${line} for one line. ${WHERE_IT_GOES}`
        ]
      : []
  );
  if (total > file) {
    problems.push(
      `AGENTS.md has ${total} characters, over the limit of ${file}. Every session reads the whole file, so delete or merge something before adding. ${WHERE_IT_GOES}`
    );
  }
  return problems;
}

/** How many characters this content has, not counting line breaks */
export function countCharacters(text) {
  return text.split('\n').reduce((sum, content) => sum + [...content].length, 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve(fileURLToPath(import.meta.url), '../../AGENTS.md');
  if (!existsSync(path)) {
    console.log('AGENTS.md is not present: nothing to check');
    process.exit(0);
  }

  const text = readFileSync(path, 'utf8');
  const problems = checkAgentsFile(text);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log(`AGENTS.md length check passed (${countCharacters(text)} of ${LIMITS.file} characters)`);
}
