import { App, Events, EventRef, TFile, TFolder, debounce, normalizePath } from "obsidian";
import {
	ArcadiaLecternSettings,
	PassageIndexEntry,
	PassageRef,
	SeriesGroup,
	SermonNote,
} from "./types";

/**
 * Matches a single scripture reference: an optional leading ordinal, a book
 * name, then an optional chapter and optional verse or verse range.
 * Examples: "John", "Ps 23", "Romans 8:1", "1 Corinthians 13:4-7".
 */
const PASSAGE_PATTERN =
	/^\s*((?:[1-3]\s*)?[A-Za-z][A-Za-z.]*(?:\s+[A-Za-z][A-Za-z.]*)*?)\s*(?:(\d+)(?::\s*(\d+)(?:\s*[-–]\s*(\d+))?)?)?\s*$/;

/** Sermons with no series name are collected under this heading. */
export const UNGROUPED_SERIES = "Ungrouped";

export class SermonDataManager extends Events {
	private app: App;
	private settings: ArcadiaLecternSettings;
	private sermons: SermonNote[] = [];
	private eventRefs: { emitter: Events; ref: EventRef }[] = [];

	/** Debounced so a burst of vault events triggers a single rebuild. */
	private scheduleRefresh = debounce(() => this.refresh(), 150, true);

	constructor(app: App, settings: ArcadiaLecternSettings) {
		super();
		this.app = app;
		this.settings = settings;
	}

	startListening(): void {
		const cache = this.app.metadataCache;
		const vault = this.app.vault;

		this.eventRefs.push({
			emitter: cache,
			ref: cache.on("changed", (file) => {
				if (this.isSermonFile(file)) this.scheduleRefresh();
			}),
		});

		this.eventRefs.push({
			emitter: vault,
			ref: vault.on("create", (file) => {
				if (file instanceof TFile && this.isSermonFile(file)) this.scheduleRefresh();
			}),
		});

		this.eventRefs.push({
			emitter: vault,
			ref: vault.on("delete", (file) => {
				if (file instanceof TFile && this.isSermonFile(file)) this.scheduleRefresh();
			}),
		});

		this.eventRefs.push({
			emitter: vault,
			ref: vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile && (this.isSermonFile(file) || this.isSermonPath(oldPath))) {
					this.scheduleRefresh();
				}
			}),
		});

		this.refresh();
	}

	stopListening(): void {
		this.scheduleRefresh.cancel();
		for (const { emitter, ref } of this.eventRefs) {
			emitter.offref(ref);
		}
		this.eventRefs = [];
	}

	updateSettings(settings: ArcadiaLecternSettings): void {
		this.settings = settings;
		this.refresh();
	}

	getSermons(): SermonNote[] {
		return this.sermons;
	}

	/** Rebuild the sermon list from the vault and notify listeners. */
	refresh(): void {
		this.sermons = this.loadSermons();
		this.trigger("data-changed");
	}

	// ---- Derived views -------------------------------------------------

	/** Sermons grouped by series, each group ordered by date ascending. */
	getSeriesGroups(): SeriesGroup[] {
		const groups = new Map<string, SermonNote[]>();
		for (const sermon of this.sermons) {
			const key = sermon.series ?? UNGROUPED_SERIES;
			const bucket = groups.get(key);
			if (bucket) {
				bucket.push(sermon);
			} else {
				groups.set(key, [sermon]);
			}
		}

		return Array.from(groups.entries())
			.map(([name, sermons]) => ({ name, sermons: sermons.sort(byDateAscending) }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	/** Every book/chapter preached, with the sermons that covered it. */
	getPassageIndex(): PassageIndexEntry[] {
		const entries = new Map<string, PassageIndexEntry>();
		for (const sermon of this.sermons) {
			for (const ref of sermon.texts) {
				const key = `${ref.book}|${ref.chapter ?? ""}`;
				const existing = entries.get(key);
				if (existing) {
					if (!existing.sermons.includes(sermon)) existing.sermons.push(sermon);
				} else {
					entries.set(key, { book: ref.book, chapter: ref.chapter, sermons: [sermon] });
				}
			}
		}

		return Array.from(entries.values()).sort((a, b) => {
			const byBook = a.book.localeCompare(b.book);
			return byBook !== 0 ? byBook : (a.chapter ?? 0) - (b.chapter ?? 0);
		});
	}

	/** Sermons scheduled or preached within the given month (0-indexed). */
	getSermonsInMonth(year: number, month: number): SermonNote[] {
		return this.sermons
			.filter((sermon) => {
				if (!sermon.preachedOn) return false;
				const date = new Date(`${sermon.preachedOn}T00:00:00`);
				return date.getFullYear() === year && date.getMonth() === month;
			})
			.sort(byDateAscending);
	}

	/**
	 * Sermons already covering any of the given references, excluding
	 * `exclude`. Overlap is judged at chapter granularity: a whole-book or
	 * whole-chapter reference matches every verse inside it.
	 */
	findOverlappingSermons(refs: PassageRef[], exclude?: TFile): SermonNote[] {
		const matches: SermonNote[] = [];
		for (const sermon of this.sermons) {
			if (exclude && sermon.file.path === exclude.path) continue;
			if (sermon.texts.some((existing) => refs.some((ref) => passagesOverlap(existing, ref)))) {
				matches.push(sermon);
			}
		}
		return matches.sort(byDateAscending);
	}

	// ---- Loading -------------------------------------------------------

	private loadSermons(): SermonNote[] {
		const folderPath = this.getFolderPath();
		if (!folderPath) return [];

		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) return [];

		const files: TFile[] = [];
		this.collectMarkdownFiles(folder, files);
		return files.map((file) => this.toSermonNote(file));
	}

	private collectMarkdownFiles(folder: TFolder, out: TFile[]): void {
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				this.collectMarkdownFiles(child, out);
			} else if (child instanceof TFile && child.extension === "md") {
				out.push(child);
			}
		}
	}

	private toSermonNote(file: TFile): SermonNote {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const read = (key: string): unknown => (key ? frontmatter[key] : undefined);

		return {
			file,
			title: file.basename,
			series: firstString(read(this.settings.seriesProperty)),
			texts: parsePassageList(read(this.settings.textProperty)),
			preachedOn: parseIsoDate(read(this.settings.dateProperty)),
			occasion: firstString(read(this.settings.occasionProperty)),
		};
	}

	private isSermonFile(file: TFile): boolean {
		return file.extension === "md" && this.isSermonPath(file.path);
	}

	private isSermonPath(path: string): boolean {
		const folder = this.getFolderPath();
		if (!folder) return false;
		return path.startsWith(folder + "/") && path.endsWith(".md");
	}

	/** Configured folder without a trailing slash, or "" when unset. */
	private getFolderPath(): string {
		const raw = this.settings.sermonFolder.trim();
		if (!raw) return "";
		const cleaned = normalizePath(raw);
		return cleaned === "/" ? "" : cleaned;
	}
}

// ---- Pure helpers, exported for testing --------------------------------

/** Sort comparator placing dated sermons first, in ascending date order. */
export function byDateAscending(a: SermonNote, b: SermonNote): number {
	if (a.preachedOn && b.preachedOn) return a.preachedOn.localeCompare(b.preachedOn);
	if (a.preachedOn) return -1;
	if (b.preachedOn) return 1;
	return a.title.localeCompare(b.title);
}

/** Read a frontmatter value as a trimmed string, or null when absent. */
export function firstString(value: unknown): string | null {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = firstString(item);
			if (found) return found;
		}
	}
	return null;
}

/**
 * Parse a frontmatter text value into references. Accepts a single string,
 * a semicolon-separated list, or a YAML list. Unparseable entries are kept
 * with `book` set to the raw text so nothing is silently dropped.
 */
export function parsePassageList(value: unknown): PassageRef[] {
	const raw: string[] = [];
	if (typeof value === "string") {
		raw.push(...value.split(";"));
	} else if (Array.isArray(value)) {
		for (const item of value) {
			if (typeof item === "string") raw.push(...item.split(";"));
		}
	}

	const refs: PassageRef[] = [];
	for (const candidate of raw) {
		const text = candidate.trim();
		if (!text) continue;
		refs.push(parsePassage(text));
	}
	return refs;
}

/** Parse one reference. Falls back to a book-only ref on no match. */
export function parsePassage(text: string): PassageRef {
	const match = PASSAGE_PATTERN.exec(text);
	if (!match) {
		return { raw: text, book: normalizeBook(text), chapter: null, verseStart: null, verseEnd: null };
	}

	const [, book, chapter, verseStart, verseEnd] = match;
	return {
		raw: text,
		book: normalizeBook(book),
		chapter: chapter ? Number(chapter) : null,
		verseStart: verseStart ? Number(verseStart) : null,
		verseEnd: verseEnd ? Number(verseEnd) : verseStart ? Number(verseStart) : null,
	};
}

/** Collapse whitespace and drop abbreviation periods so "1 Cor." === "1 Cor". */
export function normalizeBook(book: string): string {
	return book.replace(/\./g, "").replace(/\s+/g, " ").trim();
}

/**
 * True when two references touch the same text. Chapter-level granularity:
 * a whole-book reference overlaps every chapter of that book, and a
 * whole-chapter reference overlaps every verse in it.
 */
export function passagesOverlap(a: PassageRef, b: PassageRef): boolean {
	if (a.book.toLowerCase() !== b.book.toLowerCase()) return false;
	if (a.chapter === null || b.chapter === null) return true;
	if (a.chapter !== b.chapter) return false;
	if (a.verseStart === null || b.verseStart === null) return true;

	const aEnd = a.verseEnd ?? a.verseStart;
	const bEnd = b.verseEnd ?? b.verseStart;
	return a.verseStart <= bEnd && b.verseStart <= aEnd;
}

/** Normalize a frontmatter date to YYYY-MM-DD, or null when unparseable. */
export function parseIsoDate(value: unknown): string | null {
	const text = firstString(value);
	if (!text) return null;

	const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
	if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) return null;

	const month = String(parsed.getMonth() + 1).padStart(2, "0");
	const day = String(parsed.getDate()).padStart(2, "0");
	return `${parsed.getFullYear()}-${month}-${day}`;
}
