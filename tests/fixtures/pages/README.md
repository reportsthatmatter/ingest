# Golden page fixtures

Real pages, extracted with `pdftotext -layout -enc UTF-8 -f N -l N`, chosen for
being hard. Every synthetic unit test in `tests/ingest.test.ts` passed while the
Leveson defect shipped (#118 §1.5); these exist so a heuristic meets real input.

`N` below is the **PDF page index**, not the printed page number.

| Fixture | Source | Page | Why it is here |
| --- | --- | --- | --- |
| `leveson-running-header.txt` | `uk-leveson-inquiry/archive/0780_i.pdf` | 120 | Running header (`Chapter 2 \| The Press: …`) at the page edge — the furniture that became prose before the fix |
| `leveson-numbered-para.txt` | `uk-leveson-inquiry/archive/0780_ii.pdf` | 240 | Numbered paragraphs (`4.12 …`), which must not be read as headings |
| `leveson-bulleted-list.txt` | `uk-leveson-inquiry/archive/0780_ii.pdf` | 289 | A bulleted list, the shape that put text out of order in #12 |
| `psi-stacked-footnote.txt` | `us-psi-financial-crisis/archive/PSI REPORT …pdf` | 92 | Stacked footnote layout — number alone on its line, text beneath |
| `psi-quoted-bullets.txt` | `us-psi-financial-crisis/archive/PSI REPORT …pdf` | 146 | Bullets **inside a quoted email**: lifting them out of the quotation presents someone else's words as the report's |
| `challenger-ocr-noise.txt` | `challenger-accident/archive/GPO-CRPT-99hrpt1016…pdf` | 265 | Badly garbled scan (`c h a r a c t e r i z a t i o n`) — the messiest input in the corpus |
| `jack-smith-inline-notes.txt` | `jack-smith-report/archive/Report-of-Special-Counsel-Smith-Volume-1…pdf` | 40 | Inline footnote markers sitting against punctuation |
| `saville-quoted-telegram.txt` | `uk-saville-inquiry/archive/bloody-sunday-inquiry-vol1-hc29-i.pdf` | 280 | A 1972 telegram quoted verbatim in capitals — its wrapped lines read as a run of headings unless the report declares `allCapsHeadings(false)` |
| `saville-paragraph-notes.txt` | `uk-saville-inquiry/archive/bloody-sunday-inquiry-vol1-hc29-i.pdf` | 143 | Notes under each paragraph, numbered from 1 again each time, in two columns whose text wraps within each column (`paragraphNotes`) |
| `saville-map-legend.txt` | `uk-saville-inquiry/archive/bloody-sunday-inquiry-vol1-hc29-i.pdf` | 70 | A numbered map legend ("1   Jackie Duddy") shaped like a note block, which nothing in the text refers to |
| `saville-chapter-contents.txt` | `uk-saville-inquiry/archive/bloody-sunday-inquiry-vol1-hc29-i.pdf` | 147 | A chapter title that wraps, then the chapter's own contents located by paragraph, one entry wrapped before its locator (`chapterContents`) |
| `saville-recto.txt`, `saville-verso.txt` | `uk-saville-inquiry/archive/bloody-sunday-inquiry-vol1-hc29-i.pdf` | 179, 180 | Facing pages whose body margins differ (16 and 7) — one document margin severs the right-hand page (`geometry("per-page")`) |
| `jack-smith-note-p20.txt`, `jack-smith-note-p33.txt` | `jack-smith-report/archive/Report-of-Special-Counsel-Smith-Volume-1…pdf` | 20, 33 | A note's first line set *above* its own number (`40 See`, a lone `104`): the superscript sits low, so pdftotext files it on the line below (reportsthatmatter-g1f) |
| `jack-smith-note-p21.txt`, `jack-smith-note-p22.txt` | `jack-smith-report/archive/Report-of-Special-Counsel-Smith-Volume-1…pdf` | 21, 22 | A note running over from the page before, opening the block above the first numbered note, with a run-over line that starts `169 (Text messages…` (reportsthatmatter-g1f) |
| `litvinenko-notes-under-body.txt` | `uk-litvinenko-inquiry/archive/The-Litvinenko-Inquiry-H-C-695-web.pdf` | 27 | A single-spaced page set straight onto its notes: the run-over's shape, but every line of it is body (reportsthatmatter-g1f) |
| `psi-contents.txt` | `us-psi-financial-crisis/archive/PSI REPORT …pdf` | 3 | Contents page: a page number after a dot leader is not a footnote marker |
| `psi-out-of.txt` | `us-psi-financial-crisis/archive/PSI REPORT …pdf` | 13 | "Long Beach, 75 out of 75": a count after a comma, not note 75 |

To add one: pick the page, extract it, and record it here with what it is for.
A fixture that does not contain its hard case is worse than none, because it
passes for the wrong reason.
