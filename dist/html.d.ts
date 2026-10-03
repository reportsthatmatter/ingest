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
export type HtmlEvent = {
    kind: "start";
    tag: string;
    attrs: Record<string, string>;
} | {
    kind: "end";
    tag: string;
} | {
    kind: "text";
    text: string;
};
export declare function decodeEntities(text: string): string;
export declare function htmlEvents(html: string): HtmlEvent[];
