import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const refType = process.env.GITHUB_REF_TYPE;
const refName = process.env.GITHUB_REF_NAME;
const githubRepository = process.env.GITHUB_REPOSITORY;

assert.equal(refType, 'tag', 'Publishing must run from a Git tag.');
assert.ok(refName, 'GITHUB_REF_NAME is missing; this check is intended for GitHub Actions tag builds.');
assert.equal(
  refName,
  `v${packageJson.version}`,
  `Release tag ${refName} must exactly match package.json version v${packageJson.version}.`,
);
assert.ok(
  githubRepository && /^[^/]+\/[^/]+$/.test(githubRepository),
  'GITHUB_REPOSITORY must be in owner/repository format.',
);

const rawRepositoryUrl = typeof packageJson.repository === 'string'
  ? packageJson.repository
  : packageJson.repository?.url;
assert.ok(
  rawRepositoryUrl,
  'Set package.json "repository" to the real GitHub repository URL before publishing with Trusted Publishing.',
);

function normalizeGitHubUrl(value) {
  return value
    .trim()
    .replace(/^git\+/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
}

const expectedRepositoryUrl = `https://github.com/${githubRepository}`;
assert.equal(
  normalizeGitHubUrl(rawRepositoryUrl),
  expectedRepositoryUrl,
  `package.json repository URL must match ${expectedRepositoryUrl} (GITHUB_REPOSITORY).`,
);
assert.equal(
  packageJson.publishConfig?.access,
  'public',
  'Scoped package must set publishConfig.access to "public".',
);

process.stdout.write(`✓ release tag ${refName} matches ${packageJson.name}@${packageJson.version}\n`);
process.stdout.write(`✓ package repository matches ${expectedRepositoryUrl}\n`);
