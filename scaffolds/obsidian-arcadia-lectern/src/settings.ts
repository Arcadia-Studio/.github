import { App, ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import type ArcadiaLecternPlugin from "./main";
import { toStoredStatus, validateLicense } from "./license";
import { LectionaryYear, ViewMode } from "./types";

export class ArcadiaLecternSettingTab extends PluginSettingTab {
	plugin: ArcadiaLecternPlugin;

	constructor(app: App, plugin: ArcadiaLecternPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Sermon notes").setHeading();

		new Setting(containerEl)
			.setName("Sermon folder")
			.setDesc("Folder containing your sermon notes (e.g. Sermons/). Subfolders are included.")
			.addText((text) =>
				text
					.setPlaceholder("Sermons/")
					.setValue(this.plugin.settings.sermonFolder)
					.onChange((value) => {
						this.plugin.settings.sermonFolder = value.trim();
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Frontmatter properties").setHeading();

		this.addPropertySetting(
			"Series property",
			"Frontmatter key holding the series name.",
			"series",
			() => this.plugin.settings.seriesProperty,
			(value) => { this.plugin.settings.seriesProperty = value; }
		);

		this.addPropertySetting(
			"Text property",
			'Frontmatter key holding the preaching text, e.g. "Romans 8:1-11". Separate several with semicolons.',
			"text",
			() => this.plugin.settings.textProperty,
			(value) => { this.plugin.settings.textProperty = value; }
		);

		this.addPropertySetting(
			"Date property",
			"Frontmatter key holding the date preached or scheduled.",
			"preached",
			() => this.plugin.settings.dateProperty,
			(value) => { this.plugin.settings.dateProperty = value; }
		);

		this.addPropertySetting(
			"Occasion property",
			"Frontmatter key holding the occasion (Advent, funeral, midweek).",
			"occasion",
			() => this.plugin.settings.occasionProperty,
			(value) => { this.plugin.settings.occasionProperty = value; }
		);

		new Setting(containerEl).setName("Behavior").setHeading();

		new Setting(containerEl)
			.setName("Default pane")
			.setDesc("Which pane to show when the Lectern sidebar opens.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("calendar", "Calendar")
					.addOption("series", "Series")
					.addOption("passages", "Passages")
					.setValue(this.plugin.settings.defaultView)
					.onChange((value) => {
						this.plugin.settings.defaultView = value as ViewMode;
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Warn on repeated passage")
			.setDesc("Notify when the active note's text overlaps a passage you have already preached.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.warnOnRepeatPassage)
					.onChange((value) => {
						this.plugin.settings.warnOnRepeatPassage = value;
						void this.plugin.saveSettings();
					})
			);

		this.addPremiumSection();
		this.addLicenseSection();
	}

	/** One text setting bound to a frontmatter key, trimmed on save. */
	private addPropertySetting(
		name: string,
		desc: string,
		placeholder: string,
		get: () => string,
		set: (value: string) => void
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(get())
					.onChange((value) => {
						set(value.trim());
						void this.plugin.saveSettings();
					})
			);
	}

	/** Premium settings, shown disabled until a license is active. */
	private addPremiumSection(): void {
		const { containerEl } = this;
		const isPro = this.plugin.isPro();

		new Setting(containerEl).setName("Premium").setHeading();

		if (!isPro) {
			containerEl.createEl("p", {
				text: "These settings require a premium license.",
				cls: "setting-item-description",
			});
		}

		new Setting(containerEl)
			.setName("Lectionary year")
			.setDesc("Revised Common Lectionary cycle used for suggested readings.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("A", "Year A")
					.addOption("B", "Year B")
					.addOption("C", "Year C")
					.setValue(this.plugin.settings.lectionaryYear)
					.onChange((value) => {
						this.plugin.settings.lectionaryYear = value as LectionaryYear;
						void this.plugin.saveSettings();
					});
				dropdown.setDisabled(!isPro);
			});

		new Setting(containerEl)
			.setName("Illustration folder")
			.setDesc("Folder scanned for reusable illustrations.")
			.addText((text) => {
				text
					.setPlaceholder("Illustrations/")
					.setValue(this.plugin.settings.illustrationFolder)
					.onChange((value) => {
						this.plugin.settings.illustrationFolder = value.trim();
						void this.plugin.saveSettings();
					});
				text.setDisabled(!isPro);
			});
	}

	private addLicenseSection(): void {
		const { containerEl } = this;

		new Setting(containerEl).setName("License").setHeading();

		const licenseStatus = this.plugin.settings.licenseStatus;
		const isPro = this.plugin.isPro();
		const statusDesc = isPro
			? `Active${licenseStatus?.customerEmail ? ` (${licenseStatus.customerEmail})` : ""}${licenseStatus?.expiresAt ? `, expires ${licenseStatus.expiresAt}` : ""}`
			: "No active license. Enter your license key and click Validate.";

		containerEl.createEl("p", {
			text: `License status: ${statusDesc}`,
			cls: isPro ? "mod-success" : "mod-warning",
		});

		new Setting(containerEl)
			.setName("License key")
			.setDesc("Enter your license key.")
			.addText((text) =>
				text
					.setPlaceholder("Xxxx-xxxx-xxxx-xxxx")
					.setValue(this.plugin.settings.licenseKey)
					.onChange((value) => {
						this.plugin.settings.licenseKey = value.trim();
						void this.plugin.saveSettings();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Validate")
					.setCta()
					.onClick(() => { void this.validateAndRefresh(btn); })
			);

		new Setting(containerEl).addButton((btn) =>
			btn.setButtonText("Get premium").onClick(() => {
				window.open("https://arcadia-studio.lemonsqueezy.com", "_blank");
			})
		);
	}

	private async validateAndRefresh(btn: ButtonComponent): Promise<void> {
		const key = this.plugin.settings.licenseKey.trim();
		if (!key) {
			new Notice("Enter a license key first.");
			return;
		}

		btn.setButtonText("Checking...").setDisabled(true);
		const result = await validateLicense(key);

		if (result.offline) {
			// Never downgrade a cached license on a network failure
			new Notice("Could not reach the license server. Check your connection and try again. A previously activated license stays active.");
			btn.setButtonText("Validate").setDisabled(false);
			return;
		}

		this.plugin.settings.licenseStatus = toStoredStatus(result);
		this.plugin.settings.isPro = result.valid;
		await this.plugin.saveSettings();

		new Notice(
			result.valid
				? "License activated. Premium features are unlocked."
				: "The license key is invalid or expired. Check the key and try again."
		);
		this.display();
	}
}
