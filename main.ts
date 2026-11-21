// main.ts — grader entrypoint for the csv-reader-speed bounty.
//
// The harness runs `node /bot/main.ts` (node22) from a working directory
// that is not the repository, so solve.js is found from this file's own URL,
// never from process.cwd(). It reads every case from /input/cases.json
// (MAKEFUN_INPUT_DIR outside a container), answers each one alone with
// run() from solve.js, and writes /output/answers.json
// (MAKEFUN_OUTPUT_DIR outside a container): a JSON array of the answers,
// one per case and in the cases' order.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of
// its work runs under it: the house baseline runs with
// --no-incremental-marking, and an entry may tune V8's flags too.
setFlagsFromString('--no-incremental-marking');

/** solve.js, imported by its URL (a .js module carries no types). */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];
const answers: unknown[] = [];
for (const c of cases) answers.push(run(c.input));
writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
