/**
 * Worked examples for the page-break referee (reportsthatmatter-38s.11): real
 * page breaks from the test fixtures (tests/fixtures/pagebreaks/), described
 * exactly as `describeCase` describes a case. Drawn from development and
 * PDF-only reports, never the held-out set (reports/score-sets.yaml in the
 * site). `key` is the case key, so an evaluation can leave these breaks out.
 * Regenerate by hand if `describeCase` changes: the prompt id changes with
 * this file, so every cached answer records which examples it saw.
 */
export const REFEREE_EXAMPLES: Array<{ source: string; key: string; text: string; answer: "JOIN" | "SPLIT"; why?: string }> = [
  {
    source: "us-v-philip-morris PDF pages 1049-1050",
    key: "0bef1fee513917e2",
    answer: "JOIN",
    why: "an unfinished sentence runs on; the capital is a title",
    text: "Text before the break (end of a paragraph): 2751. An April 5, 1988 letter from Elizabeth H. Reiman, a Leo Burnett (Philip Morris's advertising agency) employee, addressed to Nancy Brennan Lund, now Senior Vice President for\nText after the break (start of a block): Marketing at Philip Morris, provided \"details regarding the upcoming Camel qualitative study\" and stated that \"[r]ecent strong Camel performance, especially among the young male target, has resulted in an effort to explain that success and determine the potential threat to Marlboro.\" The letter indi\nOld page (p.1049), set ragged-right, its last lines:\n  [indent +0.0 em, right gap 23.3 em] 2042329558-9566 at 9561 (US 20443).\n  [indent +3.0 em, right gap 0.0 em] 2751. An April 5, 1988 letter from Elizabeth H. Reiman,  a Leo Burnett (Philip Morris’s\n  [indent +0.0 em, right gap 0.0 em] advertising agency) employee, addressed to Nancy Brennan Lund, now Senior Vice President for\nNew page (p.1050), its first lines:\n  [indent +0.0 em, right gap 0.0 em] Marketing at Philip Morris, provided \"details regarding the upcoming Camel qualitative study\" and\n  [indent +0.0 em, right gap 0.0 em] stated that \"[r]ecent strong Camel performance, especially among the young male target, has resulted\nThe new page's first line is +0.0 em from the line under it.",
  },
  {
    source: "us-911-commission PDF pages 21-22",
    key: "754d9c640180254c",
    answer: "SPLIT",
    why: "the new page's first line is indented",
    text: "Text before the break (end of a paragraph): center in Boston. Sixteen seconds after that transmis- sion,ATC instructed the aircraft's pilots to climb to 35,000 feet.That message and all subsequent attempts to contact the flight were not acknowledged. From this and other evidence, we believe the hijacking began at 8:14 or shortly thereafter.24\nText after the break (start of a block): Reports from two flight attendants in the coach cabin, Betty Ong and Madeline \"Amy\" Sweeney, tell us most of what we know about how the hijacking happened. As it began, some of the hijackers—most likely Wail al Shehri and Waleed al Shehri, who were seated in row 2 in first class—stabbed the two unar\nOld page (p.21), set justified, its last lines:\n  [indent +0.0 em, right gap 0.0 em] and all subsequent attempts to contact the flight were not acknowledged.\n  [indent +0.0 em, right gap 0.0 em] From this and other evidence, we believe the hijacking began at 8:14 or\n  [indent +0.0 em, right gap 23.3 em] shortly thereafter.24\nNew page (p.22), its first lines:\n  [indent +1.2 em, right gap 0.0 em] Reports from two flight attendants in the coach cabin, Betty Ong and\n  [indent +0.0 em, right gap 0.0 em] Madeline “Amy” Sweeney, tell us most of what we know about how the\nThe new page's first line is +1.2 em from the line under it.",
  },
  {
    source: "us-lehman-examiner PDF pages 59-60",
    key: "75aac043cbce3325",
    answer: "JOIN",
    why: "a name broken across the page",
    text: "Text before the break (end of a paragraph): …the course of 2006, Lehman’s management and Board made the deliberate business decision to increase the firm’s risk profile generally, and to take more risk specifically with respect to principal investments with the firm’s capital. This new strategy was directed by Lehman’s highest officers – primarily Fuld, Joseph\nText after the break (start of a block): Gregory (Lehman’s President and Chief Operating Officer), and Hugh E. (Skip) McGee III (Global Head of Investment Banking) – after significant internal debate.\nOld page (p.59), set justified, its last lines:\n  [indent +0.0 em, right gap 0.1 em] deliberate business decision to increase the firm’s risk profile generally, and to take\n  [indent +0.0 em, right gap 0.1 em] more risk specifically with respect to principal investments with the firm’s capital. This\n  [indent +0.0 em, right gap 0.0 em] new strategy was directed by Lehman’s highest officers – primarily Fuld, Joseph\nNew page (p.60), its first lines:\n  [indent +0.0 em, right gap 0.0 em] Gregory (Lehman’s President and Chief Operating Officer), and Hugh E. (Skip) McGee\n  [indent +0.0 em, right gap 6.1 em] III (Global Head of Investment Banking) – after significant internal debate.\nThe new page's first line is +0.0 em from the line under it.",
  },
  {
    source: "us-deepwater-horizon PDF pages 386-387",
    key: "4f45b7b0695ceefe",
    answer: "SPLIT",
    why: "index entries: each line is its own entry",
    text: "Text before the break (end of a paragraph): , Mark, 176 dolphins. See marine mammals Dominion Exploration & Production, 225 Drake, Edwin, 296 Dresser Industries, 44 drilling terminology, definitions of, 91 drill pipe, 74, 91; in Macondo well, 4, 5, 6–7, 92–93, 104-08, 110-14, 111, 113, 120–21 Duplessis, Bonnie, 209 Duplessis, Clarence R., 209\nText after the break (start of a block): East Cameron Partners, 227 economy, effects of Macondo oil spill on, 173–74, 179, 185-91, 200; compensatory damages related to, 174, 179,\nOld page (p.386), set ragged-right, its last lines:\n  [indent +0.0 em, right gap 12.6 em] drill pipe, 74, 91; in Macondo well, 4, 5, 6–7, 92–93, 104-08, 110-14, 111, 113, 120–21\n  [indent +0.0 em, right gap 41.0 em] Duplessis, Bonnie, 209\n  [indent +0.0 em, right gap 39.2 em] Duplessis, Clarence R., 209\nNew page (p.387), its first lines:\n  [indent +0.0 em, right gap 39.4 em] East Cameron Partners, 227\n  [indent +0.0 em, right gap 2.3 em] economy, effects of Macondo oil spill on, 173–74, 179, 185-91, 200; compensatory damages related to, 174, 179,\nThe new page's first line is +0.0 em from the line under it.",
  },
  {
    source: "us-911-commission PDF pages 57-58",
    key: "b58600a306c8bfd9",
    answer: "JOIN",
    why: "a full justified last line and a flush first line: the paragraph runs on past the full stop",
    text: "Text before the break (end of a paragraph): We believe this call would have taken place sometime before 10:10 to 10:15.\nText after the break (start of a block): Among the sources that reflect other important events of that morning, there is no documentary evidence for this call, but the relevant sources are incom- plete. Others nearby who were taking notes, such as the Vice President's chief of staff, Scooter Libby, who sat next to him, and Mrs. Cheney, did\nOld page (p.57), set justified, its last lines:\n  [indent +0.0 em, right gap 0.0 em] recalled hearing him say, “Yes sir.” She believed this conversation occurred a\n  [indent +0.0 em, right gap 3.5 em] few minutes, perhaps five, after they entered the conference room.215\n  [indent +1.2 em, right gap 0.0 em] We believe this call would have taken place sometime before 10:10 to 10:15.\nNew page (p.58), its first lines:\n  [indent +0.0 em, right gap 0.0 em] Among the sources that reflect other important events of that morning, there\n  [indent +0.0 em, right gap 0.0 em] is no documentary evidence for this call, but the relevant sources are incom-\nThe new page's first line is +0.0 em from the line under it.",
  },
  {
    source: "uk-saville-inquiry PDF pages 121-122",
    key: "eb6ce4f3a6ae5e9e",
    answer: "SPLIT",
    why: "a numbered paragraph (7.44) starts",
    text: "Text before the break (end of a paragraph): ioting continued into the following day.[^1-27] Lord Cameron attributed these later disturbances to \"Hooligan elements wholly unassociated with the Civil Rights demonstrators\", who had taken advantage of a minor clash between the police and the marchers over the removal of a political banner.[^2-27]\nText after the break (start of a block): 7.44 In total, 11 policemen and 77 civilians were injured, the great majority of the latter having bruises and lacerations, mainly to the head.[^1-28] In his report, Lord Cameron criticised the organisation and stewarding of the march, and noted that some extremist and hooligan elements had sought t\nOld page (p.121), set ragged-right, its last lines:\n  [indent +0.0 em, right gap 1.3 em] attributed these later disturbances to “Hooligan elements wholly unassociated with the\n  [indent +0.0 em, right gap 2.2 em] Civil Rights demonstrators”, who had taken advantage of a minor clash between the\n  [indent +0.0 em, right gap 11.3 em] police and the marchers over the removal of a political banner.2\nNew page (p.122), its first lines:\n  [indent +0.0 em, right gap 0.8 em] In total, 11 policemen and 77 civilians were injured, the great majority of the latter having\n  [indent +0.0 em, right gap 0.3 em] bruises and lacerations, mainly to the head.1 In his report, Lord Cameron criticised the",
  },
  {
    source: "challenger-accident PDF pages 35-36",
    key: "197b5fc72fd4da7e",
    answer: "JOIN",
    why: "an unfinished sentence runs on",
    text: "Text before the break (end of a paragraph): NASA has had significant decreases in manpower. A disproportionate reduction may have occurred in the safety, reliability and quality assurance staff at NASA headquar- ters and at the Marshall Space Flight Center. Additionally during the period preceding the Challenger accident, the Office of Space\nText after the break (start of a block): Flight also suffered a decline in staff. The decreases may have lim- ited the ability of those offices to perform their review functions.\nOld page (p.35), set justified, its last lines:\n  [indent +0.0 em, right gap 0.1 em] safety,  reliability  and  quality  assurance  staff at NASA  headquar-\n  [indent +0.0 em, right gap 0.0 em] ters and at the Marshall  Space Flight  Center. Additionally  during\n  [indent +0.0 em, right gap 0.1 em] the  period  preceding  the Challenger  accident,  the Office of Space\nNew page (p.36), its first lines:\n  [indent +0.1 em, right gap 0.1 em] Flight  also suffered a decline in  staff. The decreases  may have lim-\n  [indent +0.1 em, right gap 0.1 em] ited  the  ability  of  those  offices to  perform  their  review  functions.",
  },
  {
    source: "us-deepwater-horizon PDF pages 19-20",
    key: "06bb36a30718a466",
    answer: "SPLIT",
    why: "a finished sentence on a short last line; this report sets new paragraphs flush",
    text: "Text before the break (end of a paragraph): ussed the good news that the final cement job at the bottom of the Macondo well had gone fine.20 To ensure the job did not have problems, a three-man Schlumberger team was scheduled to fly out to the rig later that day, able to perform a suite of tests to examine the well's new bottom cement seal.21\nText after the break (start of a block): According to the BP team's plan, if the cementing went smoothly, as it had, they could skip Schlumberger's cement evaluation. Generally, the completion rig would perform this test when it reopened the well to produce the oil the exploratory drilling had discovered. The decision was made to send the\nOld page (p.19), set ragged-right, its last lines:\n  [indent +0.0 em, right gap 0.7 em] well had gone fine.20 To ensure the job did not have problems, a three-man Schlumberger\n  [indent +0.0 em, right gap 0.9 em] team was scheduled to fly out to the rig later that day, able to perform a suite of tests to\n  [indent +0.0 em, right gap 19.9 em] examine the well’s new bottom cement seal.21\nNew page (p.20), its first lines:\n  [indent +0.0 em, right gap 0.1 em] According to the BP team’s plan, if the cementing went smoothly, as it had, they could skip\n  [indent +0.0 em, right gap 0.9 em] Schlumberger’s cement evaluation. Generally, the completion rig would perform this test\nThe new page's first line is +0.0 em from the line under it.",
  },
];
