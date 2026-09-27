// Minimal stand-in for the Obsidian API, so the pure helpers in src/data.ts can
// be exercised outside Obsidian. esbuild aliases "obsidian" to this file for
// the test bundle only; the plugin bundle still treats obsidian as external.
export class Events {
	on() { return {}; }
	offref() {}
	trigger() {}
}
export class TFile {}
export class TFolder {}
export class App {}
export function debounce(fn) {
	const wrapped = () => fn();
	wrapped.cancel = () => {};
	return wrapped;
}
export function normalizePath(path) { return path; }
