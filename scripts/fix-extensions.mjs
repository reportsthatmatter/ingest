/* Fixes up what `tsc` doesn't get right for a package meant to be run, not
 * just imported: explicit .js extensions on relative specifiers, and the
 * executable bit on anything with a shebang.
 *
 * tsconfig.build.json uses moduleResolution "bundler" so tsc emits relative
 * specifiers verbatim, without an extension — correct for a bundler's own
 * resolver, and invalid under Node's strict ESM resolver, which is what a
 * consumer actually gets: Vitest resolves a dependency's real files this way
 * once anything imports deep enough to walk its module graph, which failed
 * with `Cannot find module '.../dist/define'` for exactly this reason.
 *
 * `tsc` also does not preserve or set the executable bit, so a `"bin"` entry
 * — src/bin/publish.ts, the `rtm-publish` CLI — would compile to a file
 * `chmod +x` had to be run on by hand after every single build, and silently
 * regress the moment someone forgot. Any emitted file whose first line is a
 * shebang gets marked executable here instead, so it can't drift from the
 * source that declares it should be one.
 *
 * Runs after `tsc` in `pnpm build`, over dist/**\/*.js and dist/**\/*.d.ts —
 * a .d.ts with the same unresolvable specifier fails a consumer's typecheck
 * the same way a .js fails their runtime.
 */
import { readFileSync, writeFileSync, chmodSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const root = join(import.meta.dirname, "..", "dist");

const SPECIFIER = /((?:from|import)\s+["'])(\.\.?\/[^"']+)(["'])/g;

function fixed(source, filePath) {
  return source.replace(SPECIFIER, (whole, prefix, spec, suffix) => {
    if (/\.[a-z]+$/i.test(spec)) return whole; // already has an extension
    const asFile = join(dirname(filePath), `${spec}.js`);
    const asDir = join(dirname(filePath), spec, "index.js");
    const resolved = existsSync(asFile) ? `${spec}.js` : existsSync(asDir) ? `${spec}/index.js` : `${spec}.js`;
    return `${prefix}${resolved}${suffix}`;
  });
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (path.endsWith(".js") || path.endsWith(".d.ts")) {
      const before = readFileSync(path, "utf8");
      const after = fixed(before, path);
      if (after !== before) writeFileSync(path, after);
      if (path.endsWith(".js") && after.startsWith("#!")) chmodSync(path, 0o755);
    }
  }
}

walk(root);
console.log("dist/: relative specifiers carry explicit extensions.");
