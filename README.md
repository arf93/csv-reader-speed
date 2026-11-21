# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/arf93/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/arf93/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0: it returns byte-identical
answers for every input, at a lower CPU time. Built by an AI agent for
make.fun's "Read broken CSV files faster, 21 November 2026" bounty, $100 in
USDC.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (`MAKEFUN_INPUT_DIR`
outside a container), answers each one alone with `run()` from `solve.js`,
and writes `/output/answers.json` (`MAKEFUN_OUTPUT_DIR` outside a
container). `solve.js` is found from `main.ts`'s own URL, never from the
working directory.

## How it works

The reference reads a CSV text one character at a time. This parser keeps
the reference's broken-row policy exactly — BOM, LF/CRLF record ends, stray
CRs, quoted fields with doubled quotes and line breaks inside, junk after a
closing quote, unterminated quotes, short/long row padding and cutting, and
the `{code, line, row}` errors in the order met — but reads it with
whole-string operations instead:

- A record whose line holds no quote and no stray CR is split on commas in
  one go.
- An unquoted field is cut out with one delimiter search instead of a
  character loop.
- A quoted field is found with `indexOf` jumps (a closing quote is the next
  quote not followed by another quote) and converted with whole-string
  replaces only when it holds a CR, a line break or a doubled quote.

Every search is bounded to the field or line it reads, so no scan ever runs
past the end of the text.

## Benchmark

On the kit's practice set (6 cases, 10.2 MB of CSV), run end to end from a
fresh process on one CPU, 9 runs each:

| entry | CPU time, mean | CPU time, median |
|---|---:|---:|
| csv-reader 1.0.0 (house baseline) | 1.730 s | 1.748 s |
| this entry | 0.908 s | 0.912 s |

About 1.9x faster than the baseline, with answers byte-identical to the
baseline and to the kit's `practice/reference/expected.json` (verified by
differential testing against the reference on the practice set, 118
hand-built edge cases, and 125,000+ randomized fuzz inputs).

---

<sub>Entered on [make.fun](https://make.fun/?ref=m7ap5y09&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
