import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function versionParts(value) {
  return value.split('.').map((part) => Number.parseInt(part, 10));
}

function isAtLeast(actual, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    const actualPart = actual[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;
    if (actualPart > minimumPart) return true;
    if (actualPart < minimumPart) return false;
  }
  return true;
}

const nodeVersion = versionParts(process.versions.node);
assert.ok(
  isAtLeast(nodeVersion, [22, 14, 0]),
  `npm Trusted Publishing requires Node.js >=22.14.0; found ${process.versions.node}.`,
);

const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
assert.ok(
  isAtLeast(versionParts(npmVersion), [11, 5, 1]),
  `npm Trusted Publishing requires npm >=11.5.1; found ${npmVersion}.`,
);

console.log(`✓ npm Trusted Publishing runtime is supported (Node ${process.versions.node}, npm ${npmVersion}).`);
