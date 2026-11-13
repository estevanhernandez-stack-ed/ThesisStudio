#!/usr/bin/env node
/**
 * cite-add.js — append a BibTeX entry to 05_CITATIONS/references.bib.
 *
 * Reads a BibTeX entry from stdin OR from a file path argument. Validates
 * the entry's basic shape, checks for citation-key collision against the
 * existing bibliography, and appends with a blank-line separator. Exits
 * non-zero on parse failure, multi-entry input, or collision.
 *
 * One entry per call. The collision check reads a single citation key, so
 * input holding several entries is rejected rather than partly checked.
 *
 * Used by:
 *   - npm run cite:add -- path/to/entry.bib   (file input)
 *   - cat entry.bib | npm run cite:add        (stdin input)
 *
 * After append, run `npm run check:citations` to verify the new key
 * resolves against any in-flight body prose.
 *
 * Intentionally a thin wrapper. For complex multi-entry imports (Zotero
 * BBT export, mass paste from another bibliography), prefer hand-merging
 * the file and running `npm run validate` + `npm run check:citations`
 * afterward.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const BIB_PATH = path.join(REPO_ROOT, '05_CITATIONS', 'references.bib');

function readInput() {
  if (process.argv[2]) {
    const inputPath = path.resolve(process.argv[2]);
    if (!fs.existsSync(inputPath)) {
      console.error(`cite-add: input file not found: ${inputPath}`);
      process.exit(1);
    }
    return fs.readFileSync(inputPath, 'utf8');
  }
  if (process.stdin.isTTY) {
    console.error('cite-add: no input. Pipe a BibTeX entry on stdin or pass a file path.');
    console.error('  Examples:');
    console.error('    npm run cite:add -- path/to/entry.bib');
    console.error('    cat entry.bib | npm run cite:add');
    process.exit(1);
  }
  return fs.readFileSync(0, 'utf8');
}

const input = readInput().trim();
if (!input) {
  console.error('cite-add: input is empty.');
  process.exit(1);
}

// Minimal BibTeX shape check: must start with @type{key, ...
const headerMatch = input.match(/^@(\w+)\s*\{\s*([^,\s]+)\s*,/);
if (!headerMatch) {
  console.error('cite-add: input does not look like a BibTeX entry. Expected `@type{key, ...}` header.');
  process.exit(1);
}
const [, entryType, citationKey] = headerMatch;

// Brace-balance check.
const opens = (input.match(/\{/g) || []).length;
const closes = (input.match(/\}/g) || []).length;
if (opens !== closes) {
  console.error(`cite-add: unbalanced braces in input (${opens} '{' vs ${closes} '}').`);
  process.exit(1);
}

// Single-entry check. An `@type{` header only opens a new entry at brace
// depth 0; the same text inside a field value (depth > 0) is not counted.
function countEntries(text) {
  let depth = 0;
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (ch === '@' && depth === 0 && /^@\w+\s*\{/.test(text.slice(i, i + 80))) {
      count++;
    }
  }
  return count;
}

const entryCount = countEntries(input);
if (entryCount > 1) {
  console.error(`cite-add: input contains ${entryCount} BibTeX entries. cite:add takes one entry per call.`);
  console.error('         Split the input and add each entry separately, or hand-merge into');
  console.error("         05_CITATIONS/references.bib and run 'npm run check:citations'.");
  process.exit(1);
}

if (!fs.existsSync(BIB_PATH)) {
  console.error(`cite-add: ${BIB_PATH} not found. Initialize the bibliography first.`);
  process.exit(1);
}

const existing = fs.readFileSync(BIB_PATH, 'utf8');

// Collision check: case-insensitive on the citation key only.
const escapedKey = citationKey.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
const collisionRe = new RegExp(`^@\\w+\\s*\\{\\s*${escapedKey}\\s*,`, 'mi');
if (collisionRe.test(existing)) {
  console.error(`cite-add: citation key '${citationKey}' already exists in ${path.relative(REPO_ROOT, BIB_PATH)}.`);
  console.error('         Choose a different key or remove the existing entry first.');
  process.exit(1);
}

// Append with a blank-line separator if needed.
let separator;
if (existing.endsWith('\n\n')) {
  separator = '';
} else if (existing.endsWith('\n')) {
  separator = '\n';
} else if (existing.length === 0) {
  separator = '';
} else {
  separator = '\n\n';
}

fs.appendFileSync(BIB_PATH, separator + input + '\n');

console.log(`cite-add: appended @${entryType}{${citationKey}} to ${path.relative(REPO_ROOT, BIB_PATH)}.`);
console.log("         Run 'npm run check:citations' to verify the key resolves against current body prose.");
