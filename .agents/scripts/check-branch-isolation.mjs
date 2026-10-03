#!/usr/bin/env node

/**
 * Checks branch isolation rules:
 * - feature/* or fix/*: Must ONLY contain upstream code (e.g., src/, package.json, tsconfig.json).
 *   FORBIDDEN: AGENTS.md, .agents/**, docs/**, .github/**
 * - docs/*: Must ONLY contain documentation (e.g., docs/**).
 *   FORBIDDEN: src/**
 * - chore/*: Must ONLY contain harness/tooling (e.g., AGENTS.md, .agents/**, .github/**).
 *   FORBIDDEN: src/**
 *
 * Usage:
 *   node check-branch-isolation.mjs [--branch <branch>] [--base <base_ref>]
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
let branchName = null;
let baseRef = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--branch') {
    branchName = args[i + 1];
    i++;
  } else if (args[i] === '--base') {
    baseRef = args[i + 1];
    i++;
  }
}

// 1. Determine current branch name
if (!branchName) {
  try {
    branchName = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    }).trim();
  } catch (err) {
    console.error('Failed to get current branch name via git:', err.message);
    process.exit(1);
  }
}

// If on develop or main directly, skip isolation checks
if (branchName === 'develop' || branchName === 'main' || branchName === 'HEAD') {
  console.log(`ℹ️ On '${branchName}' branch. Skipping branch isolation check.`);
  process.exit(0);
}

// 2. Determine base ref
if (!baseRef) {
  try {
    execSync('git rev-parse --verify origin/develop', { cwd: REPO_ROOT, stdio: 'ignore' });
    baseRef = 'origin/develop';
  } catch {
    baseRef = 'develop';
  }
}

// 3. Get changed files compared to base ref
let changedFiles = [];
try {
  const diffOutput = execSync(`git diff --name-only ${baseRef}...HEAD`, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  }).trim();
  changedFiles = diffOutput ? diffOutput.split(/\r?\n/).map((f) => f.trim()) : [];
} catch (err) {
  // Fallback to two-dot diff
  try {
    const diffOutput = execSync(`git diff --name-only ${baseRef}`, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    }).trim();
    changedFiles = diffOutput ? diffOutput.split(/\r?\n/).map((f) => f.trim()) : [];
  } catch (fallbackErr) {
    console.error(`Failed to get git diff against ${baseRef}:`, fallbackErr.message);
    process.exit(1);
  }
}

console.log(`🔍 Checking branch isolation for '${branchName}' (base: ${baseRef})...`);
console.log(`Total changed files: ${changedFiles.length}`);

// Patterns
const HARNESS_PATTERNS = [
  /^AGENTS\.md$/i,
  /^\.agents\//i,
  /^docs\//i,
  /^\.github\//i,
];

const CODE_PATTERNS = [
  /^src\//i,
];

const isHarnessFile = (file) => HARNESS_PATTERNS.some((p) => p.test(file));
const isCodeFile = (file) => CODE_PATTERNS.some((p) => p.test(file));

let violations = [];

if (/^(feature|fix)\//.test(branchName)) {
  // Upstream code branches: No harness or documentation files allowed
  const forbiddenFiles = changedFiles.filter(isHarnessFile);
  if (forbiddenFiles.length > 0) {
    violations.push({
      rule: `Branch '${branchName}' is dedicated to upstream code (feature/fix). Harness and documentation files must NOT be modified here.`,
      files: forbiddenFiles,
      suggestion: 'Move documentation or harness changes to a separate `docs/*` or `chore/*` PR.',
    });
  }
} else if (/^docs\//.test(branchName)) {
  // Documentation branches: No src/ code changes allowed
  const forbiddenFiles = changedFiles.filter(isCodeFile);
  if (forbiddenFiles.length > 0) {
    violations.push({
      rule: `Branch '${branchName}' is dedicated to documentation (docs/*). Production code (src/) must NOT be modified here.`,
      files: forbiddenFiles,
      suggestion: 'Implement production code in a separate `feature/*` branch after proposal is merged.',
    });
  }
} else if (/^chore\//.test(branchName)) {
  // Harness/Tooling branches: No src/ production code changes allowed
  const forbiddenFiles = changedFiles.filter(isCodeFile);
  if (forbiddenFiles.length > 0) {
    violations.push({
      rule: `Branch '${branchName}' is dedicated to internal tooling and harness (chore/*). Production code (src/) must NOT be modified here.`,
      files: forbiddenFiles,
      suggestion: 'Create a `feature/*` or `fix/*` branch for changes in `src/`.',
    });
  }
} else {
  console.warn(`⚠️ Warning: Branch '${branchName}' does not use a standard prefix (feature/, fix/, docs/, chore/).`);
}

if (violations.length > 0) {
  console.error('\n❌ Branch Isolation Violations Detected:');
  for (const v of violations) {
    console.error(`\n[Violation] ${v.rule}`);
    console.error('Forbidden files:');
    for (const f of v.files) {
      console.error(`  - ${f}`);
    }
    console.error(`Recommendation: ${v.suggestion}`);
  }

  // GitHub Actions workflow command
  if (process.env.GITHUB_ACTIONS) {
    console.error(`::error::Branch isolation violation in '${branchName}'. See job log for details.`);
  }

  process.exit(1);
}

console.log('✅ Branch isolation check passed! No forbidden file mixing detected.');
process.exit(0);
