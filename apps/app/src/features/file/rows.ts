// A text that is a table: a row to a line, and between the values of a row a separator, as a spreadsheet writes
// one out (commas in a CSV, tabs in a TSV). This reads the rows back, with nothing of the browser in it.
// What it knows of how such a text is written:
// - A value may stand in double quotes. It then holds separators and line ends as they are, and a double quote
//   inside it is written twice. A double quote anywhere but at the start of a value is just that character.
// - A line ends with a line feed, a carriage return, or one after the other.
// - A line with nothing on it is no row.

/**
 * The rows of text, each the values that separator stands between. cut says the text is only the start of the
 * file: its last row is then left out when no line end closes it, since it is most likely not all there. It
 * stays when it is the only one, so that a file of one long line shows something.
 */
export function rowsOf(text: string, separator: string, cut: boolean): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  /** Ends the row being read. One with a single value that is empty came from a line with nothing on it */
  const endRow = () => {
    row.push(value);
    if (row.length > 1 || value !== '') rows.push(row);
    row = [];
    value = '';
  };

  for (let at = 0; at < text.length; at++) {
    const character = text[at];
    if (quoted) {
      if (character !== '"') value += character;
      else if (text[at + 1] === '"') {
        value += '"';
        at++;
      } else quoted = false;
    } else if (character === '"' && value === '') quoted = true;
    else if (character === separator) {
      row.push(value);
      value = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[at + 1] === '\n') at++;
      endRow();
    } else value += character;
  }

  // What follows the last line end: a row that no line end closes, or nothing
  const open = row.length > 0 || value !== '' || quoted;
  if (open && !(cut && rows.length > 0)) endRow();
  return rows;
}
