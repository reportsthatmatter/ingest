/**
 * A tolerant HTML tokenizer for clean editions (`edition.ts`).
 *
 * The editions this project serves are old, hand-authored HTML 4: unclosed
 * `<p>` and `<li>`, `<p><h4>` nestings, attributes without quotes. A tree
 * builder would have to guess how to repair them; a flat event stream does
 * not, and leaves each report's adapter to say what the tags mean in its own
 * source. Comments, `<script>` and `<style>` are dropped. Entities are decoded
 * in text and attribute values.
 */
const NAMED = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    shy: "­",
    mdash: "—",
    ndash: "–",
    hellip: "…",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    sect: "§",
    copy: "©",
    eacute: "é",
    egrave: "è",
    euml: "ë",
    aacute: "á",
    oacute: "ó",
    uuml: "ü",
    ouml: "ö",
    auml: "ä",
    ccedil: "ç",
    iacute: "í",
    ntilde: "ñ",
    plusmn: "±",
    middot: "·",
    bull: "•",
};
/** Windows-1252's 0x80-0x9F, which old pages emit as numeric references. */
const CP1252 = {
    0x80: "€", 0x82: "‚", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
    0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–",
    0x97: "—", 0x99: "™",
};
export function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (whole, body) => {
        if (body[0] === "#") {
            const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            if (!Number.isFinite(code))
                return whole;
            return CP1252[code] ?? String.fromCodePoint(code);
        }
        return NAMED[body.toLowerCase()] ?? whole;
    });
}
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
export function htmlEvents(html) {
    const events = [];
    let i = 0;
    const text = (s) => {
        if (s)
            events.push({ kind: "text", text: decodeEntities(s) });
    };
    while (i < html.length) {
        const lt = html.indexOf("<", i);
        if (lt === -1) {
            text(html.slice(i));
            break;
        }
        text(html.slice(i, lt));
        if (html.startsWith("<!--", lt)) {
            const end = html.indexOf("-->", lt + 4);
            i = end === -1 ? html.length : end + 3;
            continue;
        }
        if (html[lt + 1] === "!" || html[lt + 1] === "?") {
            const end = html.indexOf(">", lt);
            i = end === -1 ? html.length : end + 1;
            continue;
        }
        const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/.exec(html.slice(lt, lt + 4096));
        if (!m) {
            // a bare "<" in text
            text("<");
            i = lt + 1;
            continue;
        }
        const tag = m[2].toLowerCase();
        i = lt + m[0].length;
        if (m[1]) {
            events.push({ kind: "end", tag });
            continue;
        }
        if (tag === "script" || tag === "style") {
            const close = html.toLowerCase().indexOf(`</${tag}`, i);
            i = close === -1 ? html.length : html.indexOf(">", close) + 1;
            continue;
        }
        const attrs = {};
        for (const a of m[3].matchAll(ATTR)) {
            attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
        }
        events.push({ kind: "start", tag, attrs });
        if (/\/\s*$/.test(m[3]))
            events.push({ kind: "end", tag });
    }
    return events;
}
