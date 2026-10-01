#!/usr/bin/env node

/**
 * Checks for Japanese characters (Hiragana, Katakana, Kanji, Half-width kana) in src/ files.
 * Can be run in two modes:
 *   1. Full scan: node check-no-japanese.mjs --all
 *   2. Diff scan: node check-no-japanese.mjs --diff <base-ref>
 *
 * If no arguments are provided, it performs a full scan of src/ by default.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(REPO_ROOT, 'src');

// Regex matching Japanese characters:
// Hiragana: \u3040-\u309F
// Katakana: \u30A0-\u30FF
// Kanji (CJK Unified Ideographs): \u4E00-\u9FFF
// Half-width Katakana: \uFF66-\uFF9F
const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF66-\uFF9F]/;

const args = process.argv.slice(2);
let diffBase = null;
let mode = 'all';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--diff') {
    mode = 'diff';
    diffBase = args[i + 1] || 'HEAD~1';
    i++;
  } else if (args[i] === '--all') {
    mode = 'all';
  }
}

let hasError = false;

function scanText(content, filename) {
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (JAPANESE_REGEX.test(line)) {
      console.error(`❌ [Japanese detected] ${filename}:${index + 1}`);
      console.error(`   ${line.trim()}`);
      hasError = true;
    }
  });
}

function scanFile(filePath) {
  const relative = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf-8');
  scanText(content, relative);
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      scanFile(fullPath);
    }
  }
}

function scanDiff(base) {
  try {
    const command = `git diff ${base} -- "src/**"`;
    const diffOutput = execSync(command, { cwd: REPO_ROOT, encoding: 'utf-8' });
    if (!diffOutput.trim()) {
      console.log(`ℹ️ No changes in src/ compared to ${base}.`);
      return;
    }

    const diffLines = diffOutput.split(/\r?\n/);
    let currentFile = '';
    let lineNumber = 0;

    for (const line of diffLines) {
      if (line.startsWith('+++ b/')) {
        currentFile = line.substring(6);
      } else if (line.startsWith('@@')) {
        const match = line.match(/\+([0-9]+)/);
        if (match) {
          lineNumber = parseInt(match[1], 10) - 1;
        }
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        lineNumber++;
        const addedContent = line.substring(1);
        if (JAPANESE_REGEX.test(addedContent)) {
          console.error(`❌ [Japanese detected in diff] ${currentFile}:${lineNumber}`);
          console.error(`   ${addedContent.trim()}`);
          hasError = true;
        }
      } else if (!line.startsWith('-')) {
        lineNumber++;
      }
    }
  } catch (err) {
    console.error(`⚠️ Failed to compute git diff against '${base}':`, err.message);
    process.exit(1);
  }
}

console.log('🔍 Checking for Japanese characters in src/...');

if (mode === 'diff') {
  console.log(`Mode: Diff scan against '${diffBase}'`);
  scanDiff(diffBase);
} else {
  console.log('Mode: Full scan of src/');
  walkDir(SRC_DIR);
}

if (hasError) {
  console.error('\n🚨 Error: Japanese characters were found in src/ files!');
  console.error('All code and comments in src/ must be written in English.');
  process.exit(1);
} else {
  console.log('✅ No Japanese characters detected in src/. All clean!');
  process.exit(0);
}
