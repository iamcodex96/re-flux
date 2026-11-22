# REFACTOR-003 — One shared numeric-token and color parser (fix divergences first)

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Correctness / Refactor | 4 | 4 | 3 | **24** | 1 | [UNIT-010](./UNIT-010-safety-net-for-refactors.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-22 (local, not committed).** One internal module, `src/utils/valueTemplate.ts` (not re-exported from any entry point), now holds `NUMERIC_TOKEN_SOURCE`, `tokenizeNumbers`, `renderNumericTemplate`, `formatNumber`, `parseColor`, `mixRgba`, `formatRgba` and `roundChannel`; `interpolate.ts`, `cssInterpolation.ts` and `pathMorph.ts` all use it. `parseCssColor`, `clampCssChannel`, `tokenizeCssValue`, `NUMERIC_CSS_TOKEN` and the four inline path regexes are gone. `pathMorph` builds its command-and-number `TOKEN_PATTERN` from `NUMERIC_TOKEN_SOURCE`, so no exemption is needed.

**Method.** (1) `tests/values/valueParsing.characterization.test.ts` first pinned every evidence row plus the extra divergences found while probing, green on the untouched source (18 tests; original expectations kept in the session notes). (2) The accidental rows were rewritten to the converged expectation and a parity table (`valueParsing.parity.test.ts`, 30 inputs x 7 progress values, with a test-local parser independent of the production one) and the module unit tests (`tests/utils/valueTemplate.test.ts`) were added; before any `src/` change 85 of those tests failed. (3) The shared module was written and the call sites switched; everything is green.

**Intentional differences (kept, named `INTENTIONAL` in the tests).** The CSS path returns the exact input string at progress 0 and 1 and keeps the author's template: units, spacing, `rgb()`/`rgba()` function and `%` channels/alpha (`rgb(128 0 128 / 75%)`); the value path always emits `rgba(r, g, b, a)`. Incompatible CSS values switch discretely, the value path throws.

**Accidental differences (converged, named `ACCIDENTAL`; all listed in CHANGELOG "Unreleased" -> "Changed").**
- Precision: CSS and path morph output now use 5 decimals like `interpolate()` (CSS was 4); one existing expectation in `tests/adapters/dom.test.ts` changed from `33.3333px` to `33.33333px`.
- Sign and exponent: the CSS tokenizer did not know `+` or exponents (`1e-3px -> 1e-2px` produced the invalid `1e-2.5px`; `+5px -> -5px` stayed at `+5px`); it now uses the shared pattern. A leading `+` is part of the number, so `+5px -> +15px` gives `10px` on both paths.
- Colors: the CSS path checked templates before colors, so same-layout hex pairs were interpolated as numbers (`#112233 -> #445566` gave `#278899.5`), inputs were not clamped (`rgb(300 ...)` gave 150, not 128), channels were not rounded and overshoot gave `rgb(306,306,306)`. Colors are now detected first and use the shared clamped/rounded math.
- Alpha is clamped to 0..1 on both paths (overshoot gave `1.2` / `-0.2`; the CSS color branch already clamped, the value path did not).
- `rgb()` with percentage channels is a color on both paths (the value path treated it as a template and threw against hex). This changes the value-path output for such pairs to `rgba(...)`.

**Evidence extra to the original list** (the item file's evidence was incomplete, updated per roadmap/README working rule 3): hex same-layout bug, `1e-3px -> 1e-2px`, `+5px -> -5px`, overshoot, alpha overshoot, percentage channels.

**Verification.** `npm run typecheck`, `typecheck:tests`, `npm test -- --runInBand` (41 suites, **726 tests**; was 38 / 480; +18 characterization, +211 parity, +17 module tests), `check:tree-shaking`, `check:package`, `check:package:consumer` and the full `npm run check:all` (including browser integration, docs contracts and the docs build) pass. `diff -r` of `dist/**/*.d.ts` before/after `npm run build:lib` shows only the new internal `dist/utils/valueTemplate.d.ts`; `interpolate.d.ts` and `cssInterpolation.d.ts` are byte-identical. No benchmarks were run (not required). `parseColor` is a cheap-rejecting function (first character check), so the CSS path, which now asks for colors before templates on every call, does not run a regex for plain `px` values.

**Known leftover (pre-existing, both paths).** Hex literals inside compound values (for example `0 0 2px #1e3a5f`) are still chewed by the numeric tokenizer (`1e3` reads as 1000). A tokenizer that skips `#hex` literals would fix both paths; not done here to keep this item to the divergences.

## Problem

Value parsing is implemented three times with different rules, so the same string interpolates differently depending on whether it goes through `Tween`, the DOM adapter or the SVG morpher.

## Evidence

- Observed on the current `dist/` build (seen while auditing): `interpolate(a, b, 0.5)` vs `interpolateCssValue(a, b, 0.5)` give different strings for equivalent inputs — `"+5px"→"+15px"`: `10px` vs `+10px`; `"1e-3px"→"2e-3px"`: `0.0015px` vs `1.5e-3px`; `"rgb(300 0 0 / 50%)"→"rgb(0 0 300 / 100%)"`: `rgba(128, 0, 128, 0.75)` vs `rgb(150 0 150 / 75%)`; `"0.1234567px"→"1.9876543px"`: `1.05556px` vs `1.0556px` (5 vs 4 decimals); `rgba(0,0,0,.123456)→rgba(0,0,0,.9)`: `rgba(0, 0, 0, 0.51173)` vs `rgba(0,0,0,0.5117)`.
- `src/values/interpolate.ts:82` `parseNumericTemplate` uses one numeric regex (exponent and sign aware, `toFixed(5)` output); `src/adapters/dom/cssInterpolation.ts` uses a different `NUMERIC_CSS_TOKEN` (units captured, `Math.round(x*10000)/10000` output) and preserves the original template/color function.
- `src/adapters/svg/pathMorph.ts` has a third token regex (`TOKEN_PATTERN`) and repeats a fourth copy inside `createSvgPathInterpolator`.
- Two color parsers: `parseColor` (interpolate.ts:97) clamps channels and always emits `rgba()`; `parseCssColor` (cssInterpolation.ts) keeps the input color function and does not clamp the inputs.

## Scope

- Create `src/utils/valueTemplate.ts` (internal) with `tokenizeNumbers`, `parseColor` and `formatNumber`.
- Decide which differences are intentional (the CSS path deliberately preserves the author's template and color function; the value path normalizes) and which are accidental (decimal precision, sign handling). Write characterization tests for every row in the evidence table first, then converge only the accidental ones.
- Keep `interpolate()` and `interpolateCssValue()` public signatures unchanged.

## Non-goals

- No new color spaces (hsl/oklch) — that is a feature, not part of this item.

## Risks

- Outputs change for edge inputs (rounding). Record intentional changes in CHANGELOG "Unreleased" → "Changed".

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] A characterization test exists for every input in the evidence list, pinning current behaviour on `main` (green before the change); each accidental divergence is then fixed with a red→green test and each intentional one is documented in the test name.
- [x] The numeric-token regex and the rgb/hex color parser are each defined in exactly one module (`grep -rnE "function (parseColor|parseCssColor)" src` prints one definition); `pathMorph` command tokenization is exempt if justified in the PR.
- [x] A parity test over a table of ≥20 inputs asserts that both entry points agree on the *numeric value* of every channel/number (compare after parsing), even where the output format intentionally differs.
- [x] Public `.d.ts` output for `interpolate` and `interpolateCssValue` is byte-identical (`diff -r` of `dist/**/*.d.ts` before/after).
- [x] Intentional output changes are listed in `CHANGELOG.md` under Unreleased.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
