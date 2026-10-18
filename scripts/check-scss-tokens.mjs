import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stylesRoot = resolve(root, 'apps/docs/src/styles');
const tokenFile = resolve(stylesRoot, 'abstracts/_tokens.scss');
const breakpointFile = resolve(stylesRoot, 'abstracts/_breakpoints.scss');
const tokens = await readFile(tokenFile, 'utf8');
const breakpoints = await readFile(breakpointFile, 'utf8');

const requiredTokens = [
  '--rx-color-background', '--rx-color-surface', '--rx-color-primary', '--rx-color-secondary',
  '--rx-brand-background-rgb', '--rx-brand-text-rgb', '--rx-space-0', '--rx-space-4', '--rx-space-4-5',
  '--rx-radius-md', '--rx-font-body', '--rx-font-size-label', '--rx-font-weight-ui',
  '--rx-line-height-readable', '--rx-line-height-display', '--rx-tracking-meta', '--rx-tracking-display-condensed', '--rx-motion-duration-standard',
  '--rx-shadow-focus', '--rx-z-header', '--rx-z-skip-link',
];
for (const token of requiredTokens) {
  assert.ok(tokens.includes(token), `Required global design token is missing: ${token}`);
}

async function collectScss(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectScss(path));
    else if (entry.isFile() && entry.name.endsWith('.scss')) files.push(path);
  }
  return files;
}

const files = (await collectScss(stylesRoot)).filter((path) => path !== tokenFile && path !== breakpointFile);
const violations = [];
const rawHex = /#[\da-fA-F]{3,8}\b/g;
const rawRgb = /rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,|\))/gi;
const namedColorValue = /(?:^|[;{]\s*)(?:color|background(?:-color)?|border-color|fill|stroke)\s*:\s*(?:black|white|red|blue|purple|cyan|orange|gray|grey)\b/gim;
const numericBreakpoint = /@media\s*\(\s*(?:min|max)-width\s*:\s*\d+(?:\.\d+)?(?:px|rem|em)\s*\)/g;
const tokenizedBreakpointRefs = new Set([...breakpoints.matchAll(/\$(rx-breakpoint-[\w-]+)/g)].map((match) => match[1]));
const repeatedLiterals = new Map();

function rememberLiteral(family, value, file, source, index) {
  const key = `${family}:${value}`;
  const records = repeatedLiterals.get(key) ?? [];
  records.push({ file, line: source.slice(0, index).split('\n').length, value });
  repeatedLiterals.set(key, records);
}

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const relativeFile = relative(root, file);
  for (const [label, expression] of [
    ['raw hex color', rawHex],
    ['literal RGB/RGBA color channels', rawRgb],
    ['named color literal', namedColorValue],
    ['hardcoded width breakpoint', numericBreakpoint],
  ]) {
    expression.lastIndex = 0;
    let match;
    while ((match = expression.exec(source))) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${relativeFile}:${line}: ${label}: ${match[0].trim()}`);
    }
  }

  for (const match of source.matchAll(/breakpoints\.\$(rx-breakpoint-[\w-]+)/g)) {
    if (!tokenizedBreakpointRefs.has(match[1])) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${relativeFile}:${line}: undefined Sass breakpoint token: $${match[1]}`);
    }
  }

  // A token checker should keep recurring design values global while allowing one-off scene geometry.
  const declaration = /([a-z-]+)\s*:\s*([^;{}]+);/gi;
  for (const match of source.matchAll(declaration)) {
    const property = match[1].toLowerCase();
    const value = match[2].trim();
    const index = match.index;
    if (property.startsWith('--')) continue;

    if (property === 'z-index' && /^-?\d+$/.test(value)) {
      const line = source.slice(0, index).split('\n').length;
      violations.push(`${relativeFile}:${line}: numeric z-index must use a --rx-z-* token: ${value}`);
    }

    if (['font-size', 'font-weight', 'line-height', 'letter-spacing', 'border-radius', 'opacity'].includes(property)) {
      if (!value.includes('var(') && !/(?:clamp|calc|min|max)\(/.test(value)) {
        if (/^-?(?:\d+\.?\d*|\.\d+)(?:rem|px|em|%|)?(?:\s*!important)?$/.test(value)) {
          const literal = value.replace(/\s*!important$/, '').trim();
          if (!['0', '0px', '0rem', '0em', '1', '1.0', '50%', '100%', '999px'].includes(literal)) {
            rememberLiteral(property, literal, relativeFile, source, index);
          }
        }
      }
    }

    if (/^(?:margin|padding|gap|row-gap|column-gap|outline-offset)$/.test(property) && !/(?:clamp|calc|min|max)\(/.test(value)) {
      const dimensions = value.matchAll(/(?<![\w.-])-?\d+(?:\.\d+)?(?:rem|px|em)\b/g);
      for (const dimension of dimensions) {
        if (['0px', '0rem', '0em'].includes(dimension[0])) continue;
        rememberLiteral('spacing', dimension[0], relativeFile, source, index);
      }
    }

    if (property === 'font') {
      const size = value.match(/(?<![\w.-])\d+(?:\.\d+)?(?:rem|px)(?![\w.-])/);
      if (size) rememberLiteral('font shorthand size', size[0], relativeFile, source, index);
      const line = value.match(/\/(\d+(?:\.\d+)?)(?=\s)/);
      if (line) rememberLiteral('font shorthand line-height', line[1], relativeFile, source, index);
      const weight = value.match(/^\s*(400|500|600|650|700|750|800)(?=\s)/);
      if (weight) rememberLiteral('font shorthand weight', weight[1], relativeFile, source, index);
    }
  }
}

for (const [key, records] of repeatedLiterals) {
  if (records.length < 3) continue;
  for (const record of records) {
    violations.push(`${record.file}:${record.line}: repeated ${key} should use a shared token (found ${records.length} occurrences)`);
  }
}

assert.deepEqual(violations, [], `SCSS design-token violations:\n${violations.join('\n')}`);
process.stdout.write(`✓ ${files.length} SCSS files use shared design tokens for colors, typography, spacing, layering, and responsive breakpoints\n`);
