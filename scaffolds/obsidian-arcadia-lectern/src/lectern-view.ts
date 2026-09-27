import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { SermonDataManager } from "./data";
import {
	ArcadiaLecternSettings,
	SermonNote,
	VIEW_TYPE_ARCADIA_LECTERN,
	ViewMode,
} from "./types";

const MODE_LABELS: Record<ViewMode, string> = {
	calendar: "Calendar",
	series: "Series",
	passages: "Passages",
};

const MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

export class LecternView extends ItemView {
	private settings: ArcadiaLecternSettings;
	private dataManager: SermonDataManager;
	private mode: ViewMode;
	private bodyEl: HTMLElement | null = null;
	/** Month shown by the calendar pane, as a first-of-month date. */
	private visibleMonth: Date = firstOfMonth(new Date());

	constructor(leaf: WorkspaceLeaf, settings: ArcadiaLecternSettings, dataManager: SermonDataManager) {
		super(leaf);
		this.settings = settings;
		this.dataManager = dataManager;
		this.mode = settings.defaultView;
	}

	getViewType(): string {
		return VIEW_TYPE_ARCADIA_LECTERN;
	}

	getDisplayText(): string {
		return "Arcadia Lectern";
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen(): Promise<void> {
		this.registerEvent(this.dataManager.on("data-changed", () => this.renderBody()));
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	updateSettings(settings: ArcadiaLecternSettings): void {
		this.settings = settings;
		this.renderBody();
	}

	switchView(mode: ViewMode): void {
		if (this.mode === mode) return;
		this.mode = mode;
		this.render();
	}

	// ---- Rendering -----------------------------------------------------

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("arcadia-lectern-root");

		const toolbar = root.createDiv({ cls: "arcadia-lectern-toolbar" });
		const tabs = toolbar.createDiv({ cls: "arcadia-lectern-tabs" });

		for (const mode of Object.keys(MODE_LABELS) as ViewMode[]) {
			const tab = tabs.createEl("button", {
				cls: "arcadia-lectern-tab",
				text: MODE_LABELS[mode],
			});
			if (mode === this.mode) tab.addClass("is-active");
			tab.addEventListener("click", () => this.switchView(mode));
		}

		this.bodyEl = root.createDiv({ cls: "arcadia-lectern-body" });
		this.renderBody();
	}

	private renderBody(): void {
		const body = this.bodyEl;
		if (!body) return;
		body.empty();

		if (!this.settings.sermonFolder.trim()) {
			this.renderEmptyState(
				body,
				"No sermon folder set",
				"Choose a folder in Settings > Arcadia Lectern to start indexing sermon notes."
			);
			return;
		}

		const sermons = this.dataManager.getSermons();
		if (sermons.length === 0) {
			this.renderEmptyState(
				body,
				"No sermon notes found",
				`No Markdown notes were found in "${this.settings.sermonFolder}".`
			);
			return;
		}

		switch (this.mode) {
			case "calendar":
				this.renderCalendar(body);
				break;
			case "series":
				this.renderSeries(body);
				break;
			case "passages":
				this.renderPassages(body);
				break;
		}
	}

	private renderEmptyState(parent: HTMLElement, title: string, detail: string): void {
		const empty = parent.createDiv({ cls: "arcadia-lectern-empty" });
		empty.createEl("p", { cls: "arcadia-lectern-empty-title", text: title });
		empty.createEl("p", { cls: "arcadia-lectern-empty-detail", text: detail });
	}

	private renderCalendar(parent: HTMLElement): void {
		const header = parent.createDiv({ cls: "arcadia-lectern-month-header" });

		const prev = header.createEl("button", { cls: "arcadia-lectern-nav" });
		setIcon(prev, "chevron-left");
		prev.setAttribute("aria-label", "Previous month");
		prev.addEventListener("click", () => this.shiftMonth(-1));

		header.createSpan({
			cls: "arcadia-lectern-month-label",
			text: `${MONTH_NAMES[this.visibleMonth.getMonth()]} ${this.visibleMonth.getFullYear()}`,
		});

		const next = header.createEl("button", { cls: "arcadia-lectern-nav" });
		setIcon(next, "chevron-right");
		next.setAttribute("aria-label", "Next month");
		next.addEventListener("click", () => this.shiftMonth(1));

		const sermons = this.dataManager.getSermonsInMonth(
			this.visibleMonth.getFullYear(),
			this.visibleMonth.getMonth()
		);

		if (sermons.length === 0) {
			this.renderEmptyState(parent, "Nothing scheduled", "No sermons carry a date in this month.");
			return;
		}

		const list = parent.createEl("ul", { cls: "arcadia-lectern-list" });
		for (const sermon of sermons) {
			const item = list.createEl("li", { cls: "arcadia-lectern-item" });
			item.createSpan({ cls: "arcadia-lectern-item-date", text: sermon.preachedOn ?? "" });
			this.createSermonLink(item, sermon);
			if (sermon.texts.length > 0) {
				item.createSpan({
					cls: "arcadia-lectern-item-meta",
					text: sermon.texts.map((ref) => ref.raw).join("; "),
				});
			}
		}
	}

	private renderSeries(parent: HTMLElement): void {
		for (const group of this.dataManager.getSeriesGroups()) {
			const section = parent.createDiv({ cls: "arcadia-lectern-section" });
			section.createEl("h4", {
				cls: "arcadia-lectern-section-title",
				text: `${group.name} (${group.sermons.length})`,
			});

			const list = section.createEl("ul", { cls: "arcadia-lectern-list" });
			for (const sermon of group.sermons) {
				const item = list.createEl("li", { cls: "arcadia-lectern-item" });
				if (sermon.preachedOn) {
					item.createSpan({ cls: "arcadia-lectern-item-date", text: sermon.preachedOn });
				}
				this.createSermonLink(item, sermon);
			}
		}
	}

	private renderPassages(parent: HTMLElement): void {
		const list = parent.createEl("ul", { cls: "arcadia-lectern-list" });
		for (const entry of this.dataManager.getPassageIndex()) {
			const item = list.createEl("li", { cls: "arcadia-lectern-item" });
			const label = entry.chapter === null ? entry.book : `${entry.book} ${entry.chapter}`;
			item.createSpan({ cls: "arcadia-lectern-item-ref", text: label });
			item.createSpan({
				cls: "arcadia-lectern-item-meta",
				text: `${entry.sermons.length} sermon${entry.sermons.length === 1 ? "" : "s"}`,
			});

			const sublist = item.createEl("ul", { cls: "arcadia-lectern-sublist" });
			for (const sermon of entry.sermons) {
				this.createSermonLink(sublist.createEl("li"), sermon);
			}
		}
	}

	/** A clickable title that opens the sermon note in the main editor. */
	private createSermonLink(parent: HTMLElement, sermon: SermonNote): void {
		const link = parent.createEl("a", {
			cls: "arcadia-lectern-item-title",
			text: sermon.title,
			href: "#",
		});
		link.addEventListener("click", (event) => {
			event.preventDefault();
			void this.app.workspace.getLeaf(false).openFile(sermon.file);
		});
	}

	private shiftMonth(delta: number): void {
		this.visibleMonth = new Date(
			this.visibleMonth.getFullYear(),
			this.visibleMonth.getMonth() + delta,
			1
		);
		this.renderBody();
	}
}

function firstOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}
