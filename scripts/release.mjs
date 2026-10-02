#!/usr/bin/env node
// pnpm release <version> [--dry-run]
//
// Cuts a release of @rtm/ingest from main, and only from main. Consumers pin a
// git tag, and a tag resolves to the commit it points at, so a tag on a PR
// branch (unreachable from main after a squash-merge) or on a commit whose
// dist/ is behind src/ ships the wrong code. This refuses both.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const version = args.find((a) => !a.startsWith("-"))?.replace(/^v/, "");

const run = (cmd, argv, opts = {}) =>
  (execFileSync(cmd, argv, { encoding: "utf8", ...opts }) ?? "").trim();
const git = (...argv) => run("git", argv);
const step = (msg) => console.log(`\n==> ${msg}`);
const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};
const doIt = (label, fn) => {
  if (dryRun) console.log(`[dry-run] would ${label}`);
  else {
    console.log(label);
    fn();
  }
};

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version))
  fail("usage: pnpm release <version> [--dry-run]   (e.g. pnpm release 0.15.0)");
const tag = `v${version}`;
if (dryRun) console.log("DRY RUN: checks and build run for real; nothing is committed, tagged or pushed.");

step("Checking git state");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main") fail(`on '${branch}', not main. Releases are cut from main after the PR squash-merges.`);
if (git("status", "--porcelain")) fail("working tree is not clean.");
git("fetch", "origin", "main", "--tags", "--force");
const head = git("rev-parse", "HEAD");
const upstream = git("rev-parse", "origin/main");
if (head !== upstream)
  fail(`main (${head.slice(0, 7)}) is not at origin/main (${upstream.slice(0, 7)}); pull or push first.`);
if (git("tag", "--list", tag)) fail(`tag ${tag} already exists locally.`);
if (git("ls-remote", "--tags", "origin", `refs/tags/${tag}`)) fail(`tag ${tag} already exists on origin.`);

const pkgPath = "package.json";
const pkgText = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(pkgText);
if (pkg.version === version) fail(`package.json is already at ${version}.`);
console.log(`main @ ${head.slice(0, 7)}, clean, up to date; ${pkg.version} -> ${version}`);

step("Building dist/ and verifying it matches what is committed");
run("pnpm", ["build"], { stdio: "inherit" });
if (git("status", "--porcelain", "--", "dist"))
  fail("dist/ is behind src/ (the build changed it). Land a 'chore: rebuild dist' PR on main first, then release.");

step("Running tests");
run("pnpm", ["test"], { stdio: "inherit" });

step("Bumping, committing, tagging, pushing");
doIt(`bump package.json to ${version}`, () => {
  const next = pkgText.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
  if (next === pkgText) fail("could not rewrite version in package.json.");
  writeFileSync(pkgPath, next);
});
doIt(`commit "chore: release v${version}"`, () => {
  git("add", pkgPath);
  git("commit", "-m", `chore: release v${version}`);
});
doIt(`tag ${tag}`, () => git("tag", "-a", tag, "-m", `Release ${tag}`));
doIt("verify the tag is reachable from origin/main's line", () => {
  git("merge-base", "--is-ancestor", tag, "HEAD");
});
doIt(`push main and ${tag}`, () => {
  git("push", "origin", "main");
  git("push", "origin", tag);
});

console.log(dryRun ? `\nDry run OK: ${tag} would be released.` : `\nReleased ${tag}.`);
