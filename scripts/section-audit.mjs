// Counts chapters whose opening text is filed under the previous section: an h2 that is
// not at the start of its section page (so its intro and heading sit in an earlier section),
// and has intro text before a following h3 (the n9em defect).
// Usage: node scripts/section-audit.mjs <full.md>...   (run from a built tree or with type stripping)
import { readFileSync } from "node:fs";
import { renderArtifacts } from "../dist/render.js";

for (const file of process.argv.slice(2)) {
  const { fragments, meta } = renderArtifacts(readFileSync(file, "utf8"));
  let buried = 0, withIntro = 0, chapters = 0;
  const examples = [];
  for (const [si, s] of meta.sections.entries()) {
    const html = fragments[s.slug];
    const following = fragments[meta.sections[si + 1]?.slug]?.trimStart() ?? "";
    for (const m of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)) {
      chapters++;
      if (html.slice(0, m.index).trim() === "") continue;
      buried++;
      const tail = html.slice(m.index + m[0].length);
      const rest = tail.split(/<h[23]\b/)[0];
      const nextH3 = /^<h3\b/.test(rest.length === tail.length ? following : tail.slice(rest.length));
      const intro = rest.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length > 0;
      if (intro && nextH3) { withIntro++; examples.push(`${m[1].replace(/<[^>]+>/g, "")} (under ${s.slug})`); }
    }
  }
  console.log(`${file}: sections=${meta.sections.length} h2=${chapters} buried-h2=${buried} chapter-intro-misfiled=${withIntro}`);
  for (const e of examples.slice(0, 40)) console.log("   ", e);
}
