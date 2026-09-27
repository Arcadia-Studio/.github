import { parsePassage, parsePassageList, passagesOverlap, parseIsoDate, normalizeBook } from "../src/data";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
	const a = JSON.stringify(actual), e = JSON.stringify(expected);
	if (a !== e) { failures++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
	else console.log(`ok   ${label}`);
}

// Parsing
check("book only", parsePassage("John").chapter, null);
check("book+chapter", [parsePassage("Romans 8").chapter, parsePassage("Romans 8").verseStart], [8, null]);
check("single verse", [parsePassage("Romans 8:1").verseStart, parsePassage("Romans 8:1").verseEnd], [1, 1]);
check("verse range", [parsePassage("Romans 8:1-11").verseStart, parsePassage("Romans 8:1-11").verseEnd], [1, 11]);
check("en dash range", parsePassage("Romans 8:1–11").verseEnd, 11);
check("ordinal book", parsePassage("1 Corinthians 13:4-7").book, "1 Corinthians");
check("abbrev periods", normalizeBook("1 Cor."), "1 Cor");
check("abbrev equality", parsePassage("1 Cor. 13").book === parsePassage("1 Cor 13").book, true);

// Multi-reference frontmatter
check("semicolon list", parsePassageList("Isaiah 53:4-6; 1 Peter 2:24").map(r => r.book), ["Isaiah", "1 Peter"]);
check("yaml list", parsePassageList(["Psalm 23", "John 10:11"]).map(r => r.chapter), [23, 10]);
check("empty value", parsePassageList(undefined).length, 0);
check("unparseable kept", parsePassageList("see notes").length, 1);

// Overlap semantics claimed in the README
const r = (s: string) => parsePassage(s);
check("verse in range overlaps", passagesOverlap(r("Romans 8:1-11"), r("Romans 8:9")), true);
check("verse outside range", passagesOverlap(r("Romans 8:1-11"), r("Romans 8:20")), false);
check("chapter covers verse", passagesOverlap(r("Romans 8"), r("Romans 8:9")), true);
check("book covers chapter", passagesOverlap(r("Romans"), r("Romans 12:1")), true);
check("different chapter", passagesOverlap(r("Romans 8:1"), r("Romans 9:1")), false);
check("different book", passagesOverlap(r("Romans 8"), r("Galatians 8")), false);
check("case-insensitive book", passagesOverlap(r("romans 8"), r("Romans 8")), true);
check("adjacent ranges do not overlap", passagesOverlap(r("Romans 8:1-5"), r("Romans 8:6-10")), false);
check("touching ranges overlap", passagesOverlap(r("Romans 8:1-6"), r("Romans 8:6-10")), true);

// Dates
check("iso date", parseIsoDate("2026-10-04"), "2026-10-04");
check("iso datetime", parseIsoDate("2026-10-04T09:30:00"), "2026-10-04");
check("loose date", parseIsoDate("October 4, 2026"), "2026-10-04");
check("bad date", parseIsoDate("someday"), null);
check("missing date", parseIsoDate(undefined), null);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
if (failures > 0) process.exit(1);
