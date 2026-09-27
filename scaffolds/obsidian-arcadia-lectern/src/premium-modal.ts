import { App, ButtonComponent, Modal, Notice, Setting } from 'obsidian';
import { LicenseStatus, toStoredStatus, validateLicense } from './license';

interface PremiumPlugin {
	settings: {
		licenseKey: string;
		licenseStatus: LicenseStatus | null;
		isPro: boolean;
	};
	saveSettings(): Promise<void>;
}

export class PremiumModal extends Modal {
	private plugin: PremiumPlugin;
	private featureName: string;
	private keyValue = '';
	private checking = false;

	constructor(app: App, plugin: PremiumPlugin, featureName: string) {
		super(app);
		this.plugin = plugin;
		this.featureName = featureName;
	}

	onOpen(): void {
		const { contentEl } = this;
		new Setting(contentEl).setName('Premium feature').setHeading();
		contentEl.createEl('p', {
			text: `"${this.featureName}" is a premium feature.`,
		});
		contentEl.createEl('p', {
			text: 'Purchase a license to unlock all premium features, or enter your existing license key below.',
			cls: 'setting-item-description',
		});

		this.keyValue = this.plugin.settings.licenseKey;

		let activateBtn: ButtonComponent | null = null;

		new Setting(contentEl)
			.setName('License key')
			.addText(text => {
				text
					.setPlaceholder('Xxxx-xxxx-xxxx-xxxx')
					.setValue(this.keyValue)
					.onChange((value) => {
						this.keyValue = value.trim();
					});
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter' && !e.isComposing) {
						void this.activate(activateBtn);
					}
				});
			});

		new Setting(contentEl)
			.addButton(btn => {
				activateBtn = btn;
				btn
					.setButtonText('Activate')
					.setCta()
					.onClick(() => { void this.activate(btn); });
			})
			.addButton(btn => btn
				.setButtonText('Get premium')
				.onClick(() => {
					window.open('https://arcadia-studio.lemonsqueezy.com', '_blank');
				})
			);
	}

	private async activate(btn: ButtonComponent | null): Promise<void> {
		if (this.checking) return;
		if (!this.keyValue) {
			new Notice('Enter a license key first.');
			return;
		}

		this.checking = true;
		btn?.setButtonText('Checking...').setDisabled(true);

		try {
			const result = await validateLicense(this.keyValue);

			if (result.offline) {
				new Notice('Could not reach the license server. Check your connection and try again.');
				return;
			}

			if (!result.valid) {
				new Notice('The license key is invalid or expired. Check the key and try again.');
				return;
			}

			this.plugin.settings.licenseKey = this.keyValue;
			this.plugin.settings.licenseStatus = toStoredStatus(result);
			this.plugin.settings.isPro = true;
			await this.plugin.saveSettings();
			new Notice('License activated. Premium features are unlocked.');
			this.close();
		} finally {
			this.checking = false;
			btn?.setButtonText('Activate').setDisabled(false);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
