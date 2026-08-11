#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const args = new Set(process.argv.slice(2));
const requireAab = args.has('--require-aab');
const skipGitClean = args.has('--skip-git-clean');

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: process.env,
  });
}

function verifyGitClean() {
  if (skipGitClean) {
    warn('git clean check skipped by --skip-git-clean');
    return;
  }

  const unstaged = run('git', ['diff', '--quiet'], { cwd: repoRoot });
  if (unstaged.status === 1) {
    fail('git tracked worktree changes are not committed');
  } else if (unstaged.status !== 0) {
    fail(`git diff failed: ${(unstaged.stderr || unstaged.stdout || '').trim()}`);
  }

  const staged = run('git', ['diff', '--cached', '--quiet'], { cwd: repoRoot });
  if (staged.status === 1) {
    fail('git staged changes are not committed');
  } else if (staged.status !== 0) {
    fail(`git diff --cached failed: ${(staged.stderr || staged.stdout || '').trim()}`);
  }

  const untracked = run('git', ['ls-files', '--others', '--exclude-standard'], { cwd: repoRoot });
  if (untracked.status !== 0) {
    fail(`git ls-files --others failed: ${(untracked.stderr || untracked.stdout || '').trim()}`);
    return;
  }
  const sourceUntracked = untracked.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(filePath =>
      !filePath.startsWith('native-messenger/.release/') &&
      !filePath.startsWith('.secrets/') &&
      !filePath.includes('/build/')
    );
  if (sourceUntracked.length) {
    fail(`untracked source file(s) present: ${sourceUntracked.join(', ')}`);
  }
}

function verifyTrackedArtifacts() {
  const tracked = run('git', ['ls-files'], { cwd: repoRoot });
  if (tracked.status !== 0) {
    fail(`git ls-files failed: ${(tracked.stderr || tracked.stdout || '').trim()}`);
    return;
  }

  const forbidden = tracked.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(filePath => filePath !== '.env.example')
    .filter(filePath => /\.(apk|aab|jks|keystore|pem|key|env)$/.test(filePath) || /(^|\/)\.env($|\.)/.test(filePath));

  if (forbidden.length) {
    fail(`tracked release artifact or secret-like file(s): ${forbidden.join(', ')}`);
  }
}

function verifySigning() {
  const result = run('node', ['scripts/verify-android-release-config.js', '--require-signing']);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    fail('Android release signing is not ready');
  }
}

function verifyAab() {
  if (!requireAab) return;

  const aabPath = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');
  if (!fs.existsSync(aabPath)) {
    fail(`release AAB not found: ${path.relative(root, aabPath)}`);
    return;
  }

  const stat = fs.statSync(aabPath);
  if (!stat.size) {
    fail(`release AAB is empty: ${path.relative(root, aabPath)}`);
    return;
  }
}

function main() {
  verifyGitClean();
  verifyTrackedArtifacts();
  verifySigning();
  verifyAab();

  for (const message of warnings) console.warn(`WARN ${message}`);

  if (failures.length) {
    for (const message of failures) console.error(`FAIL ${message}`);
    process.exit(1);
  }

  console.log('PASS Android production readiness gate');
}

main();
