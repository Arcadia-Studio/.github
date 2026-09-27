import { Notice, Plugin, TFile } from "obsidian";
import {
	ArcadiaLecternSettings,
	DEFAULT_SETTINGS,
	VIEW_TYPE_ARCADIA_LECTERN,
	ViewMode,
} from "./types";
import { ArcadiaLecternSettingTab } from "./settings";
import { SermonDataManager, parsePassageList } from "./data";
import { LecternView } from "./lectern-view";
import { PremiumModal } from "./premium-modal";
import { isCacheValid, isWithinGracePeriod, toStoredStatus, validateLicense } from "./license";

export default class ArcadiaLecternPlugin extends Plugin {
	settings: ArcadiaLecternSettings = DEFAULT_SETTINGS;
	dataManager: SermonDataManager | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Held in a local as well as on the instance so the view factory closes
		// over a non-null reference.
		const dataManager = new SermonDataManager(this.app, this.settings);
		this.dataManager = dataManager;

		this.registerView(
			VIEW_TYPE_ARCADIA_LECTERN,
			(leaf) => new LecternView(leaf, this.settings, dataManager)
		);

		this.addRibbonIcon("book-open", "Open Arcadia Lectern", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-lectern-view",
			name: "Open Lectern sidebar",
			callback: () => { void this.activateView(); },
		});

		this.addCommand({
			id: "show-calendar",
			name: "Show preaching calendar",
			callback: () => { this.switchView("calendar"); },
		});

		this.addCommand({
			id: "show-series",
			name: "Show sermon series",
			callback: () => { this.switchView("series"); },
		});

		this.addCommand({
			id: "show-passages",
			name: "Show passage index",
			callback: () => { this.switchView("passages"); },
		});

		this.addCommand({
			id: "check-passage-history",
			name: "Check passage history for the active note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) this.reportPassageHistory(file);
				return true;
			},
		});

		this.addCommand({
			id: "suggest-lectionary-readings",
			name: "Suggest lectionary readings (premium)",
			callback: () => { this.suggestLectionaryReadings(); },
		});

		this.addSettingTab(new ArcadiaLecternSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.dataManager?.startListening();
			void this.refreshLicenseInBackground();
		});

		// Warn about a repeated text when a sermon note is opened.
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (file && this.settings.warnOnRepeatPassage) this.warnIfRepeated(file);
			})
		);
	}

	onunload(): void {
		this.dataManager?.stopListening();
	}

	/**
	 * True when premium features should be available. A cached valid license
	 * stays active through its grace period so offline users are not
	 * downgraded; only an explicit "invalid" answer disables premium.
	 */
	isPro(): boolean {
		if (!this.settings.isPro) return false;
		const status = this.settings.licenseStatus;
		if (!status) return false;
		return status.valid && (isCacheValid(status) || isWithinGracePeriod(status));
	}

	/**
	 * Revalidate the stored license once per cache window. Network failures
	 * never downgrade a cached valid license; only an explicit "invalid"
	 * answer from the server disables premium features.
	 */
	private async refreshLicenseInBackground(): Promise<void> {
		const key = this.settings.licenseKey.trim();
		if (!key) return;
		const cached = this.settings.licenseStatus;
		if (cached && isCacheValid(cached)) return;

		const result = await validateLicense(key);
		if (result.offline) return; // fail soft: keep the cached status

		const wasPro = this.settings.isPro;
		this.settings.licenseStatus = toStoredStatus(result);
		this.settings.isPro = result.valid;
		await this.saveSettings();

		if (wasPro && !result.valid) {
			new Notice("Arcadia Lectern: your license is no longer valid. Premium features are disabled. Check the license key in the plugin settings.");
		}
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<ArcadiaLecternSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.dataManager?.updateSettings(this.settings);
		this.app.workspace.getLeavesOfType(VIEW_TYPE_ARCADIA_LECTERN).forEach((leaf) => {
			if (leaf.view instanceof LecternView) {
				leaf.view.updateSettings(this.settings);
			}
		});
	}

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_ARCADIA_LECTERN);
		if (existing.length > 0) {
			void this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_ARCADIA_LECTERN, active: true });
			void this.app.workspace.revealLeaf(leaf);
		}
	}

	private switchView(mode: ViewMode): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ARCADIA_LECTERN);
		if (leaves.length > 0 && leaves[0].view instanceof LecternView) {
			leaves[0].view.switchView(mode);
			void this.app.workspace.revealLeaf(leaves[0]);
			return;
		}

		void this.activateView().then(() => {
			const opened = this.app.workspace.getLeavesOfType(VIEW_TYPE_ARCADIA_LECTERN);
			if (opened.length > 0 && opened[0].view instanceof LecternView) {
				opened[0].view.switchView(mode);
			}
		});
	}

	// ---- Passage history ------------------------------------------------

	/** Read the active note's text property and report every earlier sermon on it. */
	private reportPassageHistory(file: TFile): void {
		const matches = this.findRepeats(file);
		if (matches === null) {
			new Notice("This note has no text property to check.");
			return;
		}
		if (matches.length === 0) {
			new Notice("No earlier sermon covers this text.");
			return;
		}
		new Notice(`Already preached: ${matches.join(", ")}`, 8000);
	}

	/** Passive variant used on file-open: silent when there is nothing to report. */
	private warnIfRepeated(file: TFile): void {
		const matches = this.findRepeats(file);
		if (matches && matches.length > 0) {
			new Notice(`Text already preached in: ${matches.join(", ")}`, 6000);
		}
	}

	/**
	 * Titles of other sermons overlapping this note's text, or null when the
	 * note carries no parseable text property.
	 */
	private findRepeats(file: TFile): string[] | null {
		if (!this.dataManager) return null;

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const refs = parsePassageList(frontmatter?.[this.settings.textProperty]);
		if (refs.length === 0) return null;

		return this.dataManager
			.findOverlappingSermons(refs, file)
			.map((sermon) => (sermon.preachedOn ? `${sermon.title} (${sermon.preachedOn})` : sermon.title));
	}

	// ---- Premium --------------------------------------------------------

	private suggestLectionaryReadings(): void {
		if (!this.isPro()) {
			new PremiumModal(this.app, this, "Lectionary readings").open();
			return;
		}
		// Scaffold: the lectionary tables are not implemented yet.
		new Notice(`Lectionary year ${this.settings.lectionaryYear} readings are not implemented yet.`);
	}
}
