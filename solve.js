// Fast drop-in for csv-reader 1.0.0 (make.fun csv-reader-speed-01-run-20261121).
//
// Same answers as the reference for every input, same broken-row policy:
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF; a line with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field opening with a quote runs to the next quote that is not doubled
//     ("" inside it is one quote); each CRLF or lone CR inside it reads as LF;
//     what follows the closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk when anything is added); a quote that
//     never closes is a literal character and the text after it is read again
//     as an unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is literal; fields stay strings, never
//     trimmed or converted;
//   - columns is the first record when header is true, else null (or [] when
//     header is true and there are no records); rows are the records after it,
//     each padded with "" (short_row, with fields: its count) or cut
//     (long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record
//     starts on, row its index in rows (null for the header), in the order
//     met; a field's quote_junk when the field ends, a record's short_row or
//     long_row when the record ends.
//
// Speed comes from two shortcuts over the reference's one-character-at-a-time
// scan: a whole record whose line holds no quote and no stray CR is split on
// commas in one go, and an unquoted field is cut out with one delimiter
// search instead of a character loop. A quoted field is found with indexOf
// jumps (a closing quote is the next quote not followed by another quote)
// and its content is converted with whole-string replaces only when it holds
// a CR, a line break or a doubled quote. Every search is bounded to the
// field or line it reads, so no scan ever runs past the end of the text.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// One delimiter search, shared by every unquoted read: the next comma, CR or
// LF at or after the scan position.
const DELIM = /[,\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input, faster. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (text[0] === '\uFEFF') pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break. A CR not followed by LF is dropped (stray_cr). Returns the field
  // and how it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        if (pos < len) {
          value += text.slice(pos);
          added += len - pos;
          pos = len;
        }
        return { value, ended: END, added };
      }
      const i = m.index;
      if (i > pos) {
        value += text.slice(pos, i);
        added += i - pos;
      }
      const d = m[0];
      if (d === ',') {
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (d === '\n') {
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A CR: a line break when LF follows it, else a dropped stray CR.
      if (text[i + 1] === '\n') {
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      error('stray_cr');
      pos = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    // The closing quote is the next quote not followed by another quote.
    let cur = open + 1;
    let doubled = false;
    let close = -1;
    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) break;
      if (text[q + 1] === '"') {
        doubled = true;
        cur = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is literal, and the text after it is
      // read again as unquoted. The line is still openLine: nothing inside
      // the failed scan counted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    // The field's content, between the quotes.
    const span = text.slice(open + 1, close);
    const hasCR = span.indexOf('\r') !== -1;
    const hasNL = span.indexOf('\n') !== -1;
    let value;
    if (hasCR || hasNL) {
      const breaks = span.match(/\r\n|\r|\n/g);
      if (breaks !== null) line += breaks.length;
      value = span;
      if (hasCR) value = value.replace(/\r\n?/g, '\n');
      if (doubled) value = value.replace(/""/g, '"');
    } else if (doubled) {
      value = span.replace(/""/g, '"');
    } else {
      value = span;
    }
    pos = close + 1;
    if (pos >= len) return { value, ended: END };
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === '\r' && text[pos + 1] === '\n') {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  // Tries to read the whole record at pos (a non-newline character) in one
  // go: when its line holds no quote and no stray CR, its fields are the
  // line split on commas. Returns true when it read a record, false when
  // the record needs the field-by-field path.
  function readRecordFast() {
    const eol = text.indexOf('\n', pos);
    const atEnd = eol === -1;
    const segEnd = atEnd ? len : eol;
    // A CR right before the LF is the CRLF pair, not part of the last field.
    const bodyEnd =
      !atEnd && segEnd > pos && text[segEnd - 1] === '\r' ? segEnd - 1 : segEnd;
    const lineText = text.slice(pos, bodyEnd);
    if (lineText.indexOf('"') !== -1 || lineText.indexOf('\r') !== -1) return false;
    const fields = lineText.split(',');
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
    } else {
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.slice(width) });
        fields.length = width;
      }
      rows.push(fields);
    }
    pos = atEnd ? len : eol + 1;
    if (!atEnd) line += 1;
    return true;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    if (readRecordFast()) continue;

    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text[pos] === '"';
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.slice(width) });
      fields.length = width;
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
