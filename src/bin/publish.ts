#!/usr/bin/env node
/**
 * `rtm-publish` — a report repo publishing itself to reportsthatmatter.
 *
 *   RTM_PUBLISH_SECRET=… rtm-publish <report-id> [--file full.md] [--base <url>]
 *   RTM_PUBLISH_SECRET=… rtm-publish <report-id> --status
 *   RTM_PUBLISH_SECRET=… rtm-publish <report-id> --rollback <hash>
 *
 * Reads a report repo's own `full.md` (that repo's authority — see its
 * `ingest.ts`), renders it with `renderArtifacts`, and publishes the result
 * to the site through its publish endpoint: write the objects, then ask the
 * site to point at them. The endpoint re-derives the content hash from the
 * manifest and reads every object back before it writes the pointer, so this
 * cannot publish a version that would 404 in production — see `../publish.ts`.
 *
 * This is the CLI half of what the site's own `scripts/publish-report.mjs`
 * still does on a report's behalf today, reading from its own
 * `assets/generated/` rather than one repo's `full.md`. Same two-phase
 * protocol, same shared logic (`../publish.ts`) underneath both — moving a
 * report from "the site publishes it" to "the report repo publishes itself"
 * is which of these two callers runs, not a different mechanism.
 */
import { readFileSync } from "node:fs";
import { renderArtifacts } from "../render.js";
import { contentHash, manifestFor, tokenFor, type PublishFile } from "../publish.js";

const args = process.argv.slice(2);
const reportId = args[0];
const flag = (name: string): string | true | null => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? true);
};

if (!reportId || reportId.startsWith("--")) {
  console.error(
    "Usage: rtm-publish <report-id> [--file full.md] [--base <url>] [--status] [--rollback <hash>]"
  );
  process.exit(2);
}

const secret = process.env.RTM_PUBLISH_SECRET;
if (!secret) {
  console.error("RTM_PUBLISH_SECRET is not set. It is the site Worker's PUBLISH_SECRET.");
  process.exit(2);
}

const base = typeof flag("--base") === "string" ? (flag("--base") as string) : "https://reportsthatmatter.org";
const token = await tokenFor(secret, reportId);

async function call(path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { error: text.slice(0, 300) };
  }
  if (!response.ok) {
    console.error(`${response.status} ${path}`);
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }
  return parsed;
}

if (flag("--status")) {
  console.log(JSON.stringify(await call(`/internal/publish/${reportId}`), null, 2));
  process.exit(0);
}

const rollbackTo = flag("--rollback");

if (typeof rollbackTo !== "string") {
  const filePath = typeof flag("--file") === "string" ? (flag("--file") as string) : "full.md";
  const markdown = readFileSync(filePath, "utf8");
  const { meta, fullBody, fragments } = renderArtifacts(markdown);

  const files: PublishFile[] = [
    { path: "meta.json", body: JSON.stringify(meta) },
    { path: "full-body.html", body: fullBody },
    ...meta.sections.map((section) => ({
      path: `fragments/${section.slug}.html`,
      body: fragments[section.slug],
    })),
  ];

  const manifest = await manifestFor(files);
  const hash = await contentHash(manifest);
  const bytes = files.reduce((total, file) => total + Buffer.byteLength(file.body), 0);

  console.log(`${reportId}: ${files.length} object(s), ${(bytes / 1048576).toFixed(1)} MB → ${hash}`);

  // Batched by bytes, not by count: a fragment ranges from a few hundred
  // bytes to most of a megabyte, so a fixed batch size is either wasteful or
  // over the request limit depending on which report it meets.
  const MAX_BATCH = 4 * 1024 * 1024;
  let batch: PublishFile[] = [];
  let size = 0;
  let written = 0;

  const flush = async () => {
    if (!batch.length) return;
    const result = await call(`/internal/publish/${reportId}/objects`, { hash, files: batch });
    written += result.written;
    process.stdout.write(`\r  uploaded ${written}/${files.length}`);
    batch = [];
    size = 0;
  };

  for (const file of files) {
    const length = Buffer.byteLength(file.body);
    if (batch.length && size + length > MAX_BATCH) await flush();
    batch.push(file);
    size += length;
  }
  await flush();
  process.stdout.write("\n");

  const committed = await call(`/internal/publish/${reportId}/commit`, { hash, manifest });
  console.log(`  ✓ serving ${committed.version} (${committed.objects} objects)`);
} else {
  // Rollback: the objects for this hash are already in the bucket from a
  // previous publish, so only the pointer needs to move. Re-render locally
  // just to reconstruct the same manifest the original publish committed —
  // the endpoint checks it against what is actually stored either way.
  const filePath = typeof flag("--file") === "string" ? (flag("--file") as string) : "full.md";
  const markdown = readFileSync(filePath, "utf8");
  const { meta, fullBody, fragments } = renderArtifacts(markdown);
  const files: PublishFile[] = [
    { path: "meta.json", body: JSON.stringify(meta) },
    { path: "full-body.html", body: fullBody },
    ...meta.sections.map((section) => ({
      path: `fragments/${section.slug}.html`,
      body: fragments[section.slug],
    })),
  ];
  const manifest = await manifestFor(files);

  console.log(`${reportId}: rolling back to ${rollbackTo}`);
  const committed = await call(`/internal/publish/${reportId}/commit`, { hash: rollbackTo, manifest });
  console.log(`  ✓ serving ${committed.version} (${committed.objects} objects)`);
}
