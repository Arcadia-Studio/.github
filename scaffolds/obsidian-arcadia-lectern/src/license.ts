// Lemon Squeezy license validation for Arcadia Lectern
// Validates license keys against the Lemon Squeezy public licensing API

import { requestUrl } from 'obsidian';

export interface LicenseStatus {
	valid: boolean;
	instanceId?: string;
	customerEmail?: string;
	expiresAt?: string;
	lastChecked: number;
}

/** Result of a validation attempt. `offline` means the server could not be
 *  reached, so the cached status should be kept rather than overwritten. */
export interface LicenseValidationResult extends LicenseStatus {
	offline: boolean;
	message?: string;
}

/** Skip background revalidation if the last successful check is newer than this. */
export const LICENSE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/** A cached valid license stays active for this long without a successful
 *  recheck. Offline users are never downgraded; this only marks staleness. */
export const LICENSE_GRACE_PERIOD = 14 * 24 * 60 * 60 * 1000; // 14 days

interface LemonSqueezyValidateResponse {
	valid?: boolean;
	error?: string;
	instance?: { id?: string };
	meta?: { customer_email?: string };
	license_key?: { expires_at?: string | null };
}

export async function validateLicense(licenseKey: string): Promise<LicenseValidationResult> {
	try {
		const response = await requestUrl({
			url: 'https://api.lemonsqueezy.com/v1/licenses/validate',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
			body: JSON.stringify({ license_key: licenseKey }),
			throw: false,
		});

		let data: LemonSqueezyValidateResponse | null = null;
		try {
			data = response.json as LemonSqueezyValidateResponse;
		} catch {
			data = null;
		}

		if (response.status >= 200 && response.status < 300 && data?.valid) {
			return {
				valid: true,
				offline: false,
				instanceId: data.instance?.id,
				customerEmail: data.meta?.customer_email,
				expiresAt: data.license_key?.expires_at ?? undefined,
				lastChecked: Date.now(),
			};
		}

		// Server outage or rate limiting is not a verdict on the key.
		// Report offline so callers keep the cached status.
		if (response.status >= 500 || response.status === 429) {
			return {
				valid: false,
				offline: true,
				message: 'The license server is temporarily unavailable.',
				lastChecked: Date.now(),
			};
		}

		// Only an explicit answer counts as invalid: the body must parse as
		// JSON and report valid === false or a known error field.
		if (data && (data.valid === false || typeof data.error === 'string')) {
			return {
				valid: false,
				offline: false,
				message: data.error ?? 'The license key is invalid or expired.',
				lastChecked: Date.now(),
			};
		}

		// Unrecognized response (unparseable body or unexpected status):
		// treat as offline so a transient fault never downgrades a license.
		return {
			valid: false,
			offline: true,
			message: 'The license server returned an unexpected response.',
			lastChecked: Date.now(),
		};
	} catch {
		// Network failure: report offline so callers keep the cached status
		return {
			valid: false,
			offline: true,
			message: 'Could not reach the license server.',
			lastChecked: Date.now(),
		};
	}
}

/** Strip transient fields so only the persistent status is stored in settings. */
export function toStoredStatus(result: LicenseValidationResult): LicenseStatus {
	return {
		valid: result.valid,
		instanceId: result.instanceId,
		customerEmail: result.customerEmail,
		expiresAt: result.expiresAt,
		lastChecked: result.lastChecked,
	};
}

export function isCacheValid(status: LicenseStatus): boolean {
	return Date.now() - status.lastChecked < LICENSE_CACHE_DURATION;
}

export function isWithinGracePeriod(status: LicenseStatus): boolean {
	return status.valid && Date.now() - status.lastChecked < LICENSE_GRACE_PERIOD;
}
