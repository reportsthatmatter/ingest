import { extractPages, normaliseWhitespace } from "./extract.js";
import { splitPage, takePrintedNumber, collapseDoubleSpacing } from "./clean.js";
import { markPrintedNumbers } from "./printed-numbers.js";
import { strayFolios } from "./folios.js";
import { extractParagraphNotes } from "./paragraph-notes.js";
import { applyCorrections } from "./corrections.js";
import { rejoinHyphenated, vocabulary, wholeWords } from "./hyphens.js";
import { toBlocks, blocksToMarkdown, isContentsPage, parseContentsPage, spacedContentsBlocks, shortSubheadAt, isIllustrationList, mergeAcrossPages, contentsHeadings, contentsTitles, headingKey, numberedContents, emptyOutline, readContentsOutline, learnOutline, outlineContentsBlocks, divisionContents, bodyIndent, } from "./paragraphs.js";
import { parseFootnotes, linkInlineMarkers, linkFlushMarkers, renderEndnotes, isNotesChapterHead, parseNotesAppendix, linkFlushMarkersByChapter, } from "./footnotes.js";
import { noteFaceRunOverCount } from "./note-run-over.js";
import { applyTypographicHeadings } from "./typographic-headings.js";
import { inNoteFace, linkLayoutMarkers, pageDefinesNotes } from "./markers.js";
import { LayoutEndnotesReader, chapterOfBlocks } from "./layout-endnotes.js";
import { autoFix, findSuspects, rankSuspects } from "./ocr.js";
import { assembleEdition, fillGaps, fillPrintedGaps } from "./edition.js";
import { VisionHybrid } from "./vision/hybrid.js";
/**
 * Whether a heading stays a section under `unlistedHeadingsMinor`: the
 * contents lists it, it is a numbered section or division read from the
 * contents, it is numbered like a section, or it names a division.
 */
function keepsSection(text, listed, numbered) {
    if (listed.has(headingKey(text)))
        return true;
    if (/^(?:Part|Chapter|Appendix) [^:]+: /.test(text))
        return true;
    if (/^(?:[A-Z]|\d{1,2})\.\d{1,2}\s/.test(text))
        return true;
    if (/^appendix [a-z]\b/i.test(text))
        return true;
    if (/\b(?:part|chapter|appendix)\s+(?:\d{1,2}|[a-z])$/i.test(text))
        return true;
    return [...numbered.divisions.values()].some((title) => headingKey(title) === headingKey(text));
}
/**
 * Reads a page in the stretches between its short subheads
 * (`shortSubheads`), each subhead a level-4 heading of its own.
 */
function readWithSubheads(lines, read) {
    const blocks = [];
    let from = 0;
    for (let i = 0; i < lines.length; i++) {
        if (!shortSubheadAt(lines, i))
            continue;
        blocks.push(...read(lines.slice(from, i)));
        blocks.push({ kind: "heading", level: 4, text: lines[i].replace(/\s+/g, " ").trim() });
        from = i + 1;
    }
    blocks.push(...read(lines.slice(from)));
    return blocks;
}
/** A paragraph that is only a division label (`divisionLabels`): "Findings", "Recommendation:", "Issue 3". */
const DIVISION_LABEL = /^(Recommendations?|Findings?|Issue(?:\s+(?:[0-9]{1,2}|[IVXLC]{1,4}))?):?$/;
export function divisionLabelHeadings(blocks) {
    return blocks.map((block) => {
        if (block.kind !== "paragraph")
            return block;
        const text = block.text.replace(/\s+/g, " ").trim();
        if (!DIVISION_LABEL.test(text))
            return block;
        const { finding: _finding, printedNumber: _printed, ...rest } = block;
        return { ...rest, kind: "heading", level: 4, text: text.replace(/:$/, "") };
    });
}
/**
 * PDF → Markdown, deterministically. The same input always produces the same
 * output, so fixes belong in this pipeline rather than in hand-edits of the
 * result — that way every correction compounds across future reports.
 */
export function ingest(pdfPath, meta) {
    return ingestPageGroups([extractPages(pdfPath)], meta);
}
export function ingestPages(pages, meta) {
    return ingestPageGroups([pages], meta);
}
/**
 * Ingests one continuous report from one or more PDFs. Multi-volume reports
 * keep a margin per source volume: each PDF's page furniture and typesetting
 * may differ, so one global margin is not meaningful across all of them.
 */
export function ingestPageGroups(pageGroups, meta, resolved = {
    geometry: "document",
    flushFootnoteMarkers: false,
    numberedParagraphs: false,
    allCapsHeadings: true,
    bodyPasses: [],
    volumePasses: [],
}, corrections = [], context = {}) {
    if (resolved.edition)
        return ingestEdition(pageGroups, meta, resolved, corrections, context);
    // Volume is assigned here because this is the only place that knows the
    // order the volumes were given in — and that order is semantic: footnote
    // numbering and page indices run continuously across them.
    const pages = pageGroups.flatMap((group, groupIndex) => group.map((page) => ({ ...page, volume: groupIndex + 1 }))).map((page, i) => ({ ...page, index: i + 1 }));
    const sourceText = pages.map((page) => page.lines.join("\n")).join("\n");
    const footnotes = [];
    const bodyChunks = [];
    let expectedNote = 1;
    // `endnotes`: once a printed "Notes" appendix's own chapter heading is
    // confirmed, every remaining line of the document is read from here
    // instead of the ordinary per-page block builder — see `parseNotesAppendix`
    // (reportsthatmatter-60p). Sticky rather than re-tested per page: the
    // appendix is the report's back matter, and nothing of the report's own
    // text follows it.
    let notesStarted = false;
    const notesLines = [];
    // `layoutEndnotes`: notes sections read off the layout, page by page.
    const endnotesReader = resolved.layoutEndnotes && context.layout ? new LayoutEndnotesReader(context.layout) : undefined;
    const endnotesHeadings = new Map();
    // `visionStructure`: a note's tail that ran over the page break, by the note it was added to.
    const runOvers = new Map();
    let pageOffset = 0;
    const splitGroups = pageGroups.map((group) => group.map(() => {
        const page = pages[pageOffset++];
        // `footnoteResets`: the page where the numbering starts over at a number the sequence cannot guess
        const reset = resolved.footnoteResets?.find((r) => r.page === page.pdfIndex && (r.volume ?? 1) === page.volume);
        if (reset)
            expectedNote = reset.note;
        // Notes under each paragraph are read across the volume below, not
        // as a block at the page foot; endnotes are not read as notes at all.
        const splitOptions = {
            citationRunOver: resolved.citationRunOver,
            romanFolios: resolved.romanFolios,
            parenFolios: resolved.parenFolios,
            pageHeadFolios: resolved.pageHeadFolios,
            footnoteGap: resolved.footnoteGap,
            footnoteRestarts: resolved.footnoteRestarts,
            sequencedNoteOpenings: resolved.sequencedNoteOpenings,
            footnoteNumbers: resolved.footnoteNumbers,
        };
        let split = resolved.paragraphNotes || resolved.endnotes || resolved.layoutEndnotes
            ? splitPageNumberOnly(page, { romanFolios: resolved.romanFolios, parenFolios: resolved.parenFolios, pageHeadFolios: resolved.pageHeadFolios })
            : splitPage(page, expectedNote, splitOptions);
        // `footnoteNumbers("period")`: a block opening "8. In all of the above cases" in the body's face is
        // the body's own numbered paragraphs (an appendix's), not notes: the page is read without them.
        const firstNote = split.footnotes.find((line) => line.trim());
        if ((resolved.footnoteNumbers === "period" || resolved.footnoteNumbers === "tabbed") &&
            context.layout &&
            firstNote &&
            !inNoteFace(context.layout, split.volume, split.pdfIndex, firstNote, resolved.footnoteNumbers === "tabbed")) {
            split = splitPage(page, expectedNote, { ...splitOptions, footnoteNumbers: undefined });
        }
        // `noteFaceRunOver`: body lines at the foot of the page in the notes' own face are the tail of the note
        // from the page before, which opens the footnote area above this page's first note.
        if (resolved.noteFaceRunOver && context.layout && split.footnotes.length) {
            const n = noteFaceRunOverCount(context.layout, split.volume, split.pdfIndex, split.body, split.footnotes);
            if (n) {
                const tail = split.body.slice(split.body.length - n);
                split.body = split.body.slice(0, split.body.length - n);
                split.runOver = [...tail, ...(split.runOver ?? [])];
            }
        }
        // `pdfPageNumbers`: the report prints no folios; its pages are numbered by their place in the PDF.
        if (resolved.pdfPageNumbers)
            split.printed = split.pdfIndex;
        // `layoutMarkers` (page scope): page-foot "notes" on a page whose layout
        // defines none (nothing raised, nothing in a smaller face) are the body's
        // own lines, a contents page's entries most often (reportsthatmatter-b94).
        if (resolved.layoutMarkers?.scope === "page" &&
            context.layout &&
            split.footnotes.length &&
            !pageDefinesNotes(context.layout, split.volume, split.pdfIndex, resolved.footnoteNumbers === "tabbed")) {
            split.body = [...split.body, ...split.footnotes];
            split.footnotes = [];
        }
        // A page of a notes section: its notes are read off the layout, and its body keeps only what
        // is printed above the section's heading, the heading and the preamble.
        const read = endnotesReader?.page(split, split.body);
        if (read) {
            split.body = read.body;
            if (read.heading.length)
                endnotesHeadings.set(`${split.volume}:${split.pdfIndex}`, read.heading);
            footnotes.push(...read.notes);
        }
        // A note that ran over the page break: its tail opens this page's
        // block, and belongs to the last note read before it.
        const previous = footnotes[footnotes.length - 1];
        if (split.runOver && previous) {
            previous.text = normaliseWhitespace(`${previous.text} ${split.runOver.join(" ")}`);
            runOvers.set(previous, split.runOver.join(" "));
        }
        else if (split.runOver) {
            // Nothing to give it back to: leave it where it was read.
            split.body = [...split.body, ...split.runOver];
        }
        if (split.footnotes.length) {
            const parsed = parseFootnotes(split.footnotes, split.index, resolved.footnoteNumbers ?? "bare", { sequenced: resolved.sequencedNoteOpenings }).map((note) => ({
                ...note,
                volume: split.volume,
                pdfIndex: split.pdfIndex,
                printed: split.printed,
            }));
            // `footnoteRestarts`: a block that opens below the expected number starts the numbering over
            if (resolved.footnoteRestarts && parsed.length && parsed[0].number < expectedNote)
                parsed[0].restart = true;
            if (reset && parsed.length)
                parsed[0].restart = true;
            footnotes.push(...parsed);
            // `holdNoteSequence`: a table's own notes ("1 2 3" under a table in the running 650s) do not move the
            // number the next page expects
            const top = parsed.length ? Math.max(...parsed.map((n) => n.number)) : 0;
            if (parsed.length && !(resolved.holdNoteSequence && top < expectedNote - 1))
                expectedNote = top + 1;
        }
        // Body passes rewrite the page's own lines once its furniture is off:
        // reading two columns in order, for instance.
        split.body = resolved.bodyPasses.reduce((lines, pass) => pass.run(lines, context, { volume: split.volume, pdfIndex: split.pdfIndex, printed: split.printed }), split.body);
        return split;
    }));
    // `foliosInStep`: a printed number read off a figure or test-report page's OCR garble, out of step with the
    // pages round it, is dropped, and the page numbered from its neighbours (reportsthatmatter-uw50).
    const folios = splitGroups.flatMap((group) => group.map((s) => ({ volume: s.volume, pdfIndex: s.pdfIndex, printed: s.printed, dropped: false })));
    if (resolved.foliosInStep) {
        for (const group of splitGroups) {
            const stray = strayFolios(group.flatMap((s) => (s.printed === null ? [] : [{ pdfIndex: s.pdfIndex, printed: s.printed }])));
            if (!stray.size)
                continue;
            const volume = group[0]?.volume;
            for (const split of group)
                if (stray.has(split.pdfIndex))
                    split.printed = null;
            for (const row of folios)
                if (row.volume === volume && stray.has(row.pdfIndex))
                    row.dropped = true;
            for (const note of footnotes)
                if (note.volume === volume && note.pdfIndex !== undefined && stray.has(note.pdfIndex))
                    note.printed = null;
        }
    }
    if (resolved.paragraphNotes) {
        let block = 1;
        for (const group of splitGroups) {
            const read = extractParagraphNotes(group, block);
            footnotes.push(...read.notes);
            block = read.nextBlock;
        }
    }
    // Which passes run is a declared property of the document, not something
    // inferred from how many arguments were typed on the command line.
    const cleanedGroups = splitGroups.map((group) => resolved.volumePasses.reduce((pages, pass) => pass.run(pages, context), group));
    // `layoutEndnotes`: a notes section's heading and preamble join the page's body once its furniture is off.
    for (const split of endnotesHeadings.size ? cleanedGroups.flat() : []) {
        const heading = endnotesHeadings.get(`${split.volume}:${split.pdfIndex}`);
        if (heading)
            split.body = [...split.body, ...heading];
    }
    // Each page's own text once its furniture is off, for `cleanEdition` to align against.
    const pageText = cleanedGroups.flat().map((split) => ({
        volume: split.volume,
        pdfIndex: split.pdfIndex,
        lines: [...split.body, ...split.footnotes],
        // the trailing lines that are the page-foot note block, as read
        ...(split.footnotes.length ? { noteLines: split.footnotes.length } : {}),
    }));
    // Measured on the page *body*, never on the raw lines.
    //
    // A footnote block sits at the left edge, and so does page furniture, so
    // measuring the raw lines put Litvinenko's margin at 0 when its body text
    // is at 6. Anything indented five past the margin reads as a quotation —
    // and these reports set numbered paragraphs with a hanging indent, the
    // number at the edge and the text inset — so 865 of its 1,089 paragraphs
    // were cut in half, the first line left as prose and the rest quoted.
    const margins = resolved.geometry === "per-volume"
        ? cleanedGroups.map((group) => bodyIndent(group.flatMap((page) => page.body)))
        : [bodyIndent(cleanedGroups.flat().flatMap((page) => page.body))];
    // `listedHeadings`: the titles the report's contents names, learnt as its
    // contents pages go by. The contents pages themselves are not gated, nor is
    // anything before them — the contents lists what follows it.
    const listed = new Set();
    // `numberedSections`: the sections and chapters the contents numbers.
    const numbered = { sections: new Map(), chapters: new Set(), divisions: new Map() };
    // `numberedFindings`: the finding number expected next, across pages.
    const findings = resolved.numberedFindings ? { next: 1 } : undefined;
    // `contentsOutline`: the headings the contents lists, learnt as it goes by.
    const outline = resolved.contentsOutline ? emptyOutline() : undefined;
    // `listedDivisions`: the parts, chapters and appendices the contents lists.
    const divisions = { entries: [], used: new Set() };
    // `visionStructure`: a vision model's verified block structure, page by page (vision/hybrid.ts).
    const hybrid = resolved.vision ? new VisionHybrid(resolved.vision, () => vocabulary(sourceText), context.layout, corrections.map((c) => c.find)) : undefined;
    for (const [groupIndex, group] of cleanedGroups.entries()) {
        for (const split of group) {
            const pageLines = collapseDoubleSpacing(split.body, resolved.doubleSpaced
                ? margins[resolved.geometry === "per-volume" ? groupIndex : 0]
                : undefined);
            if (resolved.endnotes) {
                if (!notesStarted) {
                    notesStarted = pageLines.some((line) => isNotesChapterHead(line, numbered.chapters));
                }
                if (notesStarted) {
                    for (const line of pageLines) {
                        notesLines.push({ volume: split.volume, pdfIndex: split.pdfIndex, printed: split.printed, line });
                    }
                    continue;
                }
            }
            const titles = resolved.listedHeadings || resolved.unlistedHeadingsMinor ? contentsTitles(pageLines, resolved.recoverListedHeadings) : [];
            for (const title of titles)
                listed.add(headingKey(title));
            const gate = resolved.listedHeadings && !titles.length && listed.size ? listed : undefined;
            // The contents pages themselves are laid out as they were before.
            const entries = resolved.numberedSections ? numberedContents(pageLines) : undefined;
            for (const [number, title] of entries?.sections ?? [])
                numbered.sections.set(number, title);
            for (const chapter of entries?.chapters ?? [])
                numbered.chapters.add(chapter);
            for (const [key, title] of entries?.divisions ?? [])
                numbered.divisions.set(key, title);
            const sections = resolved.numberedSections && !entries?.sections.size && numbered.sections.size
                ? numbered
                : undefined;
            const listedHere = resolved.listedDivisions ? divisionContents(pageLines) : [];
            divisions.entries.push(...listedHere);
            const divisionGate = resolved.listedDivisions && !listedHere.length && divisions.entries.length
                ? divisions
                : undefined;
            const at = { volume: split.volume, pdfIndex: split.pdfIndex, printed: split.printed };
            const outlineEntries = outline ? readContentsOutline(pageLines) : [];
            if (outline)
                learnOutline(outline, outlineEntries);
            const readBody = (lines) => toBlocks(lines, resolved.geometry === "per-page"
                ? pageMargin(split.body, margins[0])
                : resolved.shiftedPages
                    ? shiftedPageMargin(split.body, margins[resolved.geometry === "per-volume" ? groupIndex : 0])
                    : margins[resolved.geometry === "per-volume" ? groupIndex : 0], resolved.quoteInset, resolved.numberedParagraphs, resolved.allCapsHeadings, resolved.chapterContents, resolved.numberedHeadings ?? true, gate, sections, findings, outline, divisionGate, resolved.wrappedHeadings, resolved.hangingIndents, resolved.unmarkedHeadings, resolved.numberedOutsideTables, resolved.recoverListedHeadings, resolved.letteredItems, resolved.speakerTurns);
            const read = (resolved.contentsEntries && (entries?.sections.size || isIllustrationList(pageLines))
                ? spacedContentsBlocks(pageLines)
                : isContentsPage(pageLines)
                    ? parseContentsPage(pageLines, resolved.recoverListedHeadings)
                    : outlineEntries.length
                        ? outlineContentsBlocks(pageLines, outlineEntries)
                        : resolved.shortSubheads
                            ? readWithSubheads(pageLines, readBody)
                            : readBody(pageLines)).map((block) => ({ ...block, at }));
            const labelled = resolved.divisionLabels ? divisionLabelHeadings(read) : read;
            const blocks = hybrid
                ? hybrid.page({
                    volume: split.volume,
                    pdfIndex: split.pdfIndex,
                    body: pageLines,
                    footLines: split.footnotes,
                    blocks: labelled,
                    at,
                    pipelineNotes: footnotes.filter((note) => note.volume === split.volume && note.pdfIndex === split.pdfIndex).map((note) => note.text),
                })
                : labelled;
            // Record where each printed page begins. These documents are cited by page
            // ("Report at 62"), so the printed number is the citation unit readers
            // already use — and it can be checked against the original PDF.
            if (split.printed !== null && blocks.length) {
                bodyChunks.push({ kind: "page", number: split.printed, at });
            }
            else if (split.roman && blocks.length) {
                bodyChunks.push({ kind: "page", number: split.roman, at });
            }
            // `contentsEntries` read the contents as entries: whatever it names —
            // chapters, appendices, "Preface" — is a heading the report lists, as
            // leaders would have said (`unlistedHeadingsMinor`).
            const readEntries = Boolean(resolved.contentsEntries && (entries?.sections.size || isIllustrationList(pageLines)));
            if (readEntries && resolved.unlistedHeadingsMinor) {
                for (const block of blocks) {
                    if (block.kind !== "contents")
                        continue;
                    listed.add(headingKey(block.text.replace(/\\/g, "").replace(/^\d{1,2}\.\d{1,2}\s+/, "")));
                }
            }
            if (resolved.unlistedHeadingsMinor && !titles.length && !readEntries && listed.size) {
                for (const block of blocks) {
                    if (block.kind === "heading" && !keepsSection(block.text, listed, numbered)) {
                        block.level = 4;
                    }
                }
            }
            bodyChunks.push(...blocks);
        }
    }
    // The text-only marker linker keeps the note numbers the pipeline itself read: the vision pages' notes add
    // labels it would otherwise take as license to link a bare number anywhere ("testing. . . 3 8" as note 3).
    const pipelineKnown = hybrid ? new Set(footnotes.map((note) => note.number)) : undefined;
    if (hybrid)
        footnotes.splice(0, footnotes.length, ...hybrid.footnotes(footnotes, runOvers));
    let notesChapters = [];
    if (notesLines.length) {
        const appendix = parseNotesAppendix(notesLines, numbered.chapters);
        footnotes.push(...appendix.notes);
        notesChapters = appendix.chapters;
    }
    // A page whose number was not read (a figure page, a folio set as "(3)" or
    // above a thumb index) between two that were, in step with the PDF's page order,
    // is marked with the number between them, at its own first block: without a
    // marker its text is cited with the page before (reportsthatmatter-d662).
    markUnreadPages(bodyChunks);
    // A printed number that appears more than once in a report needs telling
    // apart, or every occurrence renders the same anchor and a citation to the
    // second silently lands on the first.
    const seenPage = new Map();
    for (const block of bodyChunks) {
        if (block.kind !== "page")
            continue;
        const count = (seenPage.get(block.number) ?? 0) + 1;
        seenPage.set(block.number, count);
        if (count > 1)
            block.occurrence = count;
    }
    // Footnote markers that OCR fused to the preceding word. Scoped to the
    // notes collected near each block's own page: these documents number notes
    // sequentially, so page locality is what turns an ambiguous typographic
    // guess into a lookup that can be trusted to auto-apply.
    const notesByPage = new Map();
    // Keyed by volume as well as page: a per-volume page index alone collapses
    // volume 1 page 50 into volume 4 page 50, widening the window fourfold.
    const pageKey = (volume, page) => `${volume ?? 1}:${page}`;
    for (const note of footnotes) {
        const key = pageKey(note.volume, note.pdfIndex ?? note.page);
        if (!notesByPage.has(key))
            notesByPage.set(key, new Set());
        notesByPage.get(key).add(note.number);
    }
    const notesNear = (at) => {
        const page = at?.pdfIndex;
        if (page === undefined)
            return new Set();
        const near = new Set();
        // A note whose text runs over is parsed on the following page, so look
        // one page either side of the marker.
        for (const offset of [-1, 0, 1]) {
            for (const n of notesByPage.get(pageKey(at?.volume, page + offset)) ?? [])
                near.add(n);
        }
        return near;
    };
    // Headings the text reading ran into the next paragraph, cut out by their typography,
    // before the markers are linked and the pages joined (reportsthatmatter-a8l).
    const headingStats = resolved.typographicHeadings && context.layout
        ? applyTypographicHeadings(bodyChunks, context.layout, resolved.typographicHeadings)
        : undefined;
    // Raised markers, read off the PDF's layout: before the text-only linkers,
    // which then leave alone what is already linked.
    let markerStats;
    if (resolved.layoutMarkers && context.layout) {
        const known = new Set(footnotes.map((note) => note.number));
        const chapters = resolved.layoutMarkers.scope === "chapter" && endnotesReader
            ? chapterOfBlocks(bodyChunks, endnotesReader.chapters)
            : undefined;
        markerStats = linkLayoutMarkers(bodyChunks, context.layout, chapters
            ? { scope: "chapter", chapterOf: (block) => chapters.get(block) }
            : resolved.layoutMarkers.scope === "document"
                ? { scope: "document", known }
                : { scope: "page", onPage: (volume, pdfIndex) => notesByPage.get(pageKey(volume, pdfIndex)) ?? new Set() });
    }
    // With the layout deciding, the text-only linkers stay out unless asked for.
    const textLinkers = !markerStats || resolved.layoutMarkers.textFallback;
    for (const block of resolved.flushFootnoteMarkers && textLinkers ? bodyChunks : []) {
        const plausible = notesNear(block.at);
        if (!plausible.size)
            continue;
        if (block.kind === "list") {
            block.items = block.items.map((item) => linkFlushMarkers(item, plausible));
        }
        else if (block.kind !== "page") {
            block.text = linkFlushMarkers(block.text, plausible);
        }
    }
    // Corrections are the last word on the text: applied after the structure is
    // settled, before it is serialised, so re-running reproduces the same output.
    // Footnote-definition text goes through the same pass — a footnote's OCR
    // degrades at least as badly as the body's, and until this it had nowhere
    // a correction could reach it (reportsthatmatter-3jb).
    const joined = mergeAcrossPages(bodyChunks, {
        continuations: resolved.pageBreakContinuations,
        quoteTails: resolved.pageBreakQuoteTails,
        quoteRunOn: resolved.quoteRunOn,
        quoteListRunOns: resolved.quoteListRunOns,
        layoutJoins: resolved.layoutPageJoins,
        photoCredits: resolved.photoCredits,
        letteredItems: resolved.letteredItems,
        numberedOpenings: resolved.numberedOpenings,
        layout: context.layout,
    });
    const visionReport = hybrid?.report(hybrid.joins(joined));
    const corrected = applyCorrections(resolved.chapterContents ? contentsHeadings(joined) : joined, corrections, meta.title, footnotes);
    // Printed paragraph numbers are escaped (and a year split off its sentence
    // rejoined) so Markdown does not read them as list items: see printed-numbers.ts.
    const outBlocks = markPrintedNumbers(corrected.blocks);
    let body = blocksToMarkdown(outBlocks, {
        escapeNumberedParagraphs: resolved.escapeNumberedParagraphs,
        escapeLeadingHash: resolved.escapeLeadingHash,
    });
    const notes = corrected.footnotes;
    // Rejoin words the typesetter broke at a line end, decided from the
    // document's own vocabulary. Before autoFix, so a repaired word is judged
    // whole rather than as two fragments.
    const hyphenOptions = resolved.hyphenFragments ? { fragments: wholeWords(sourceText) } : {};
    body = rejoinHyphenated(body, vocabulary(sourceText), hyphenOptions);
    const fixed = autoFix(body);
    body = fixed.text;
    // Paragraph notes are linked where they were read, against the paragraph
    // above them; a document-wide number lookup would only relink stray
    // numbers to notes whose "1" means something different on every page.
    if (!resolved.paragraphNotes && textLinkers) {
        // A labelled note ("3-5", `layoutEndnotes`) is not what a bare [^3] would open.
        const defined = new Set(notes.filter((note) => !note.label).map((note) => note.number));
        const known = pipelineKnown ? new Set([...pipelineKnown].filter((n) => defined.has(n))) : defined;
        body = hybrid ? linkOutsideVision(body, outBlocks, (text) => linkInlineMarkers(text, known)) : linkInlineMarkers(body, known);
        // An endnotes appendix's own markers are flush against the word before
        // them far more often than not ("Airport.1") — `linkInlineMarkers` alone
        // leaves most of them as bare digits. Scoped per chapter because the
        // appendix's numbering restarts (reportsthatmatter-60p).
        if (resolved.endnotes && notesChapters.length) {
            body = linkFlushMarkersByChapter(body, numbered.chapters, notesChapters);
        }
    }
    const suspects = rankSuspects(pages.flatMap((page) => findSuspects(page.lines.join(" "), page.index).map((suspect) => ({
        ...suspect,
        volume: page.volume,
        pdfIndex: page.pdfIndex,
    }))));
    // Footnote and citation text is where the scan degrades worst, so the same
    // certain-substitution pass matters more here than it does in the body.
    let noteFixes = 0;
    // Notes read off the layout keep each printed line's end: rejoin the typesetter's hyphens as the body's are.
    if (endnotesReader) {
        const words = vocabulary(sourceText);
        for (const note of notes)
            if (note.label)
                note.text = rejoinHyphenated(note.text, words, hyphenOptions);
    }
    for (const note of notes) {
        const result = autoFix(note.text);
        note.text = result.text;
        noteFixes += result.applied;
    }
    const endnotes = renderEndnotes(notes);
    const markdown = [
        frontMatter({
            ...meta,
            pages: pages.length,
            footnotes: notes.length,
            // Omitted at zero so a report with no corrections is unchanged, and
            // visible the moment there is a human judgement on the record.
            ...(corrected.applied ? { corrections: corrected.applied } : {}),
        }),
        body,
        endnotes ? `## Notes\n\n${endnotes}` : "",
    ]
        .filter(Boolean)
        .join("\n\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trimEnd()
        .concat("\n");
    // Blocks are joined with one blank line and none holds one, so the final body splits back into them,
    // except where the hyphen rejoin closed a paragraph into the next ("fol-" / "lowing").
    const linkedText = alignChunks(outBlocks, body.split("\n\n"));
    return {
        markdown,
        sourceText,
        footnotes: notes,
        suspects,
        autoFixes: fixed.applied + noteFixes,
        corrections: corrected.applied,
        pages: pages.length,
        blocks: outBlocks,
        linkedText,
        pageText,
        folios,
        ...(markerStats ? { layoutMarkers: markerStats } : {}),
        ...(visionReport ? { vision: visionReport } : {}),
        ...(headingStats ? { typographicHeadings: headingStats } : {}),
    };
}
/**
 * `visionStructure`: the text-only marker linker runs on every block but those whose structure came from
 * the vision reading, whose markers the model placed and the layer confirmed; there it would only add the
 * bare numbers the model said were not markers ("2 8" as note 2). Falls back to the whole text when the
 * chunks cannot be paired with the blocks.
 */
function linkOutsideVision(body, blocks, link) {
    const chunks = body.split("\n\n");
    const paired = alignChunks(blocks, chunks);
    if (!paired)
        return link(body);
    const vision = new Set();
    let j = 0;
    paired.forEach((chunk, i) => {
        if (chunk === undefined)
            return;
        if (blocks[i].source === "vision")
            vision.add(j);
        j++;
    });
    return chunks.map((chunk, i) => (vision.has(i) ? chunk : link(chunk))).join("\n\n");
}
/**
 * Pairs each block with its chunk of the final text. A block the hyphen rejoin
 * closed into the one before it has no chunk of its own (`undefined`). Gives up
 * (`undefined`) if the chunks cannot be accounted for by the blocks in order.
 */
function alignChunks(blocks, chunks) {
    if (chunks.length === blocks.length)
        return chunks;
    const head = (text) => text.replace(/^(?:> )?(?:- |#{1,6} )?/, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").slice(0, 10);
    // (a contents entry's chunk carries its page number after the text, so compare as far as the shorter goes)
    const startsLike = (a, b) => {
        const n = Math.min(6, a.length, b.length);
        return n > 0 ? a.slice(0, n) === b.slice(0, n) : a === b;
    };
    const own = (b) => b.kind === "list" ? (b.items[0] ?? "") : b.kind === "page" ? "page" : b.kind === "contents" ? b.text : b.text;
    const out = [];
    let j = 0;
    for (const b of blocks) {
        const c = chunks[j];
        const matches = c !== undefined &&
            (b.kind === "page" ? c.startsWith("%%page") : startsLike(head(b.kind === "contents" ? c.replace(/ — [^ ]*$/, "") : c), head(own(b))));
        if (matches) {
            out.push(c);
            j++;
        }
        else
            out.push(undefined);
    }
    return j === chunks.length ? out : undefined;
}
/**
 * One page's own left margin, for a document whose margin moves from page to
 * page (Saville's facing pages sit 7 and 16 columns in, and drift between
 * pages of the same side).
 *
 * A numbered paragraph gives it exactly: its text starts at the margin, one
 * gap after the number ("9.165   When shown…"). That is preferred to the most
 * common indent, which a page carrying a long quotation hands to the quote —
 * Saville p.275, where a telegram outnumbers the prose around it. A page with
 * neither, or too short to say, takes the document's.
 */
function pageMargin(body, fallback) {
    const counts = new Map();
    for (const line of body) {
        const opener = line.match(NUMBERED_OPENER);
        if (opener)
            counts.set(opener[0].length, (counts.get(opener[0].length) ?? 0) + 1);
    }
    if (counts.size)
        return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const lines = body.filter((line) => line.trim());
    return lines.length >= PAGE_MARGIN_MIN_LINES ? bodyIndent(lines) : fallback;
}
/**
 * The left margin of a page the scan has shifted (`shiftedPages`,
 * reportsthatmatter-m2y): every line of its body sits in from the document's
 * margin by the same few columns. Only a page whose commonest indent is also
 * its least, over at least fifteen lines of prose, is taken to be shifted, and
 * only by two to six columns: a page that is mostly quotation has the same
 * commonest indent, but carries lines of its own prose at the margin, and a
 * table or an exhibit sits further in. Any other page takes the document's.
 */
function shiftedPageMargin(body, fallback) {
    const lines = body.filter((line) => normaliseWhitespace(line).split(" ").length > 3);
    if (lines.length < SHIFTED_PAGE_MIN_LINES)
        return fallback;
    const counts = new Map();
    for (const line of lines) {
        const indent = line.length - line.trimStart().length;
        counts.set(indent, (counts.get(indent) ?? 0) + 1);
    }
    const least = Math.min(...counts.keys());
    const commonest = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const shift = least - fallback;
    return commonest === least && shift >= 2 && shift <= 6 ? least : fallback;
}
const SHIFTED_PAGE_MIN_LINES = 15;
/** "9.165   " up to where its text starts; the glyph after it may be unmapped. */
const NUMBERED_OPENER = /^\s{0,8}\d{1,2}\.\d{1,3}[ \uFFFD]{2,}(?=\S)/;
const PAGE_MARGIN_MIN_LINES = 8;
/** The printed page number off, and nothing else: no page-foot note block. */
function splitPageNumberOnly(page, options = {}) {
    const { printed, roman, lines } = takePrintedNumber(page.lines, { roman: options.romanFolios, paren: options.parenFolios, head: options.pageHeadFolios });
    return {
        index: page.index,
        volume: page.volume,
        pdfIndex: page.pdfIndex,
        printed,
        ...(roman ? { roman } : {}),
        body: lines,
        footnotes: [],
    };
}
/**
 * `fillPrintedGaps` on the PDF path: inserts, in place, a page marker before
 * the first block of each page the gap-filler numbers. A page with no block of
 * its own (a blank or figure-only page) gets none, so markers never stack.
 */
export function markUnreadPages(chunks) {
    const read = chunks.flatMap((block) => block.kind === "page" && block.at ? [{ volume: block.at.volume, pdfIndex: block.at.pdfIndex, number: block.number }] : []);
    const have = new Set(read.map((entry) => `${entry.volume}:${entry.pdfIndex}`));
    const fill = new Map(fillPrintedGaps(read)
        .filter((entry) => !have.has(`${entry.volume}:${entry.pdfIndex}`))
        .map((entry) => [`${entry.volume}:${entry.pdfIndex}`, entry]));
    if (!fill.size)
        return;
    for (let i = chunks.length - 1; i >= 0; i--) {
        const block = chunks[i];
        if (block.kind === "page" || !block.at)
            continue;
        const key = `${block.at.volume}:${block.at.pdfIndex}`;
        const entry = fill.get(key);
        if (!entry)
            continue;
        // the earliest block of the page: walk back while the block before it is on the same page
        let first = i;
        while (first > 0 && chunks[first - 1].kind !== "page" && chunks[first - 1].at?.volume === block.at.volume && chunks[first - 1].at?.pdfIndex === block.at.pdfIndex)
            first--;
        chunks.splice(first, 0, { kind: "page", number: entry.number, at: { volume: entry.volume, pdfIndex: entry.pdfIndex, printed: null } });
        fill.delete(key);
        i = first;
    }
}
function frontMatter(fields) {
    const lines = Object.entries(fields)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => typeof value === "number" ? `${key}: ${value}` : `${key}: ${JSON.stringify(String(value))}`);
    return `---\n${lines.join("\n")}\n---`;
}
/**
 * `cleanEdition`: the text and structure from the edition, the printed pages
 * from the PDF (see `edition.ts`). The PDF ingest runs in full as the shadow:
 * its page markers say which PDF page carries which printed number, exactly
 * as a PDF-sourced build would mark them. Corrections are judgements about
 * the PDF's text, so they apply to the shadow.
 */
function ingestEdition(pageGroups, meta, resolved, corrections, context) {
    const pass = resolved.edition;
    const shadow = ingestPageGroups(pageGroups, meta, { ...resolved, edition: undefined }, corrections, context);
    // the PDF's words page by page, as the shadow read them once their furniture was off
    const pages = (shadow.pageText ?? []).map(({ noteLines, ...page }, i) => ({
        index: i + 1,
        ...page,
        // with the notes laid out as a foot of their own below, the raw note block is not page text as well
        ...(pass.notes === "page-foot" && noteLines ? { lines: page.lines.slice(0, page.lines.length - noteLines) } : {}),
    }));
    if (pass.notes === "page-foot") {
        // The notes the shadow lifted out from under their paragraphs go back on their pages, as a
        // foot of their own; the markers it linked into the body text are not words.
        const at = new Map(pages.map((page) => [`${page.volume}:${page.pdfIndex}`, page]));
        for (const page of pages)
            page.lines = page.lines.map((line) => line.replace(/\[\^[^\]]*\]/g, ""));
        for (const note of shadow.footnotes) {
            const page = at.get(`${note.volume}:${note.pdfIndex}`);
            if (!page)
                continue;
            page.lines.push(note.text);
            page.footLines = (page.footLines ?? 0) + 1;
        }
    }
    const printed = fillPrintedGaps((shadow.blocks ?? []).flatMap((block) => block.kind === "page" && block.at
        ? [{ volume: block.at.volume, pdfIndex: block.at.pdfIndex, number: block.number, occurrence: block.occurrence }]
        : []));
    // What the edition says it lacks (its `gap` blocks) is filled from the shadow's own blocks.
    const { edition, filled } = fillGaps(pass.read(), pages, {
        blocks: shadow.blocks ?? [],
        linkedText: shadow.linkedText,
        footnotes: shadow.footnotes,
    });
    const assembled = assembleEdition(edition, pages, printed, pass.sources, { floats: pass.floats });
    if (filled.length) {
        assembled.report.filled = filled;
        const printedOf = new Map(printed.map((entry) => [`${entry.volume}:${entry.pdfIndex}`, entry.number]));
        // a gap the PDF had nothing for (two web pages that were consecutive after all) is in the report, not the queue
        for (const gap of filled.filter((g) => g.blocks > 0)) {
            const at = gap.from ? printedOf.get(`${gap.from.volume}:${gap.from.pdfIndex}`) : undefined;
            assembled.suspects.push({
                pattern: "edition gap filled from the PDF",
                match: gap.opening ?? "",
                context: `${gap.reason}: ${gap.blocks} blocks, ${gap.words} words, ${gap.notes} notes, from PDF p.${gap.from.pdfIndex} to p.${gap.to.pdfIndex}`,
                page: typeof at === "number" ? at : 0,
                volume: gap.from?.volume,
                pdfIndex: gap.from?.pdfIndex,
                confidence: "possible",
            });
        }
    }
    const printedAt = new Map(printed.map((entry) => [`${entry.volume}:${entry.pdfIndex}`, entry.number]));
    const footnotes = edition.notes.map((note, i) => {
        // the PDF page the note's first word is printed on, so a golden page can say which notes it defines
        const at = assembled.notePages[i] === undefined ? undefined : pages[assembled.notePages[i]];
        const number = at ? printedAt.get(`${at.volume}:${at.pdfIndex}`) : undefined;
        return {
            number: Number.parseInt(note.label, 10) || i + 1,
            label: note.label,
            text: note.text,
            page: at?.index ?? 0,
            ...(at ? { volume: at.volume, pdfIndex: at.pdfIndex, printed: typeof number === "number" ? number : null } : {}),
        };
    });
    const markdown = [
        frontMatter({ ...meta, pages: shadow.pages, footnotes: footnotes.length }),
        assembled.body,
        assembled.notes ? `## Notes\n\n${assembled.notes}` : "",
    ]
        .filter(Boolean)
        .join("\n\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trimEnd()
        .concat("\n");
    return {
        markdown,
        corrections: 0,
        sourceText: shadow.sourceText,
        footnotes,
        suspects: assembled.suspects,
        autoFixes: 0,
        pages: shadow.pages,
        edition: assembled.report,
        shadow,
        folios: shadow.folios,
        blocks: assembled.blocks,
        linkedText: assembled.linkedText,
    };
}
