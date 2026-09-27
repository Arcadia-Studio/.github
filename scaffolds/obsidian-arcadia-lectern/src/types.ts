import { TFile } from "obsidian";
import type { LicenseStatus } from "./license";

export const VIEW_TYPE_ARCADIA_LECTERN = "arcadia-lectern-view";

/** The three panes of the Lectern sidebar. */
export type ViewMode = "calendar" | "series" | "passages";

export interface ArcadiaLecternSettings {
	/** Folder scanned for sermon notes. Empty means the plugin stays idle. */
	sermonFolder: string;
	/** Frontmatter key holding the series name. */
	seriesProperty: string;
	/** Frontmatter key holding the preaching text, e.g. "Romans 8:1-11". */
	textProperty: string;
	/** Frontmatter key holding the date the sermon was or will be preached. */
	dateProperty: string;
	/** Frontmatter key holding the occasion (Advent, funeral, midweek). */
	occasionProperty: string;
	defaultView: ViewMode;
	/** Notify when a note's text overlaps one already preached. */
	warnOnRepeatPassage: boolean;
	/** Premium. Lectionary cycle year: "A", "B", or "C". */
	lectionaryYear: LectionaryYear;
	/** Premium. Folder scanned for reusable illustrations. */
	illustrationFolder: string;
	licenseKey: string;
	licenseStatus: LicenseStatus | null;
	isPro: boolean;
}

export type LectionaryYear = "A" | "B" | "C";

export const DEFAULT_SETTINGS: ArcadiaLecternSettings = {
	sermonFolder: "",
	seriesProperty: "series",
	textProperty: "text",
	dateProperty: "preached",
	occasionProperty: "occasion",
	defaultView: "calendar",
	warnOnRepeatPassage: true,
	lectionaryYear: "A",
	illustrationFolder: "",
	licenseKey: "",
	licenseStatus: null,
	isPro: false,
};

/**
 * A scripture reference parsed from frontmatter. `chapter` is null when the
 * reference names a whole book; `verseStart`/`verseEnd` are null when the
 * reference names a whole chapter.
 */
export interface PassageRef {
	/** The reference exactly as written in the note. */
	raw: string;
	book: string;
	chapter: number | null;
	verseStart: number | null;
	verseEnd: number | null;
}

/** A sermon note in the configured folder, with its frontmatter interpreted. */
export interface SermonNote {
	file: TFile;
	title: string;
	series: string | null;
	texts: PassageRef[];
	/** ISO date (YYYY-MM-DD) when parseable, otherwise null. */
	preachedOn: string | null;
	occasion: string | null;
}

/** Sermons grouped under one series, ordered by date ascending. */
export interface SeriesGroup {
	name: string;
	sermons: SermonNote[];
}

/** One entry in the passage index: a book/chapter and the sermons on it. */
export interface PassageIndexEntry {
	book: string;
	chapter: number | null;
	sermons: SermonNote[];
}
