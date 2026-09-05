/* Adds explicit .js extensions to relative import/export specifiers in dist/.
 *
 * tsconfig.build.json uses moduleResolution "bundler" so tsc emits relative
 * specifiers verbatim, without an extension — correct for a bundler's own
 * resolver, and invalid under Node's strict ESM resolver, which is what a
 * consumer actually gets: Vitest resolves a dependency's real files this way
 * once anything imports deep enough to walk its module graph, which failed
 * with `Cannot find module '.../dist/define'` for exactly this reason.
 *
 * Runs after `tsc` in `pnpm build`, over dist/**\/*.js and dist/**\/*.d.ts —
 * a .d.ts with the same unresolvable specifier fails a consumer's typecheck
 * the same way a .js fails their runtime.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
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
    }
  }
}

walk(root);
console.log("dist/: relative specifiers carry explicit extensions.");
