# REFACTOR-003 — One shared numeric-token and color parser (fix divergences first)

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Correctness / Refactor | 4 | 4 | 3 | **24** | 1 | [UNIT-010](./UNIT-010-safety-net-for-refactors.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

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

- [ ] A characterization test exists for every input in the evidence list, pinning current behaviour on `main` (green before the change); each accidental divergence is then fixed with a red→green test and each intentional one is documented in the test name.
- [ ] The numeric-token regex and the rgb/hex color parser are each defined in exactly one module (`grep -rnE "function (parseColor|parseCssColor)" src` prints one definition); `pathMorph` command tokenization is exempt if justified in the PR.
- [ ] A parity test over a table of ≥20 inputs asserts that both entry points agree on the *numeric value* of every channel/number (compare after parsing), even where the output format intentionally differs.
- [ ] Public `.d.ts` output for `interpolate` and `interpolateCssValue` is byte-identical (`diff -r` of `dist/**/*.d.ts` before/after).
- [ ] Intentional output changes are listed in `CHANGELOG.md` under Unreleased.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
