# Arcadia Lectern

<!-- Screenshot pending. Add docs/screenshot.png, then restore the line below:
![Arcadia Lectern](docs/screenshot.png)
-->

Arcadia Lectern turns a folder of sermon notes into a working preaching desk. It reads the frontmatter you already write, then gives you three views over it: a calendar of what is scheduled, your notes grouped into series, and an index of every passage you have preached, so you can see at a glance whether you have stood on a text before. Nothing is stored outside your notes; the plugin only reads and indexes.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-1.7.2+-purple)
![License](https://img.shields.io/badge/license-MIT-green)

> Status: scaffold. The free views listed below are implemented; premium features are stubbed and raise a notice.

## Features

| Feature | Free | Premium |
| ------- | :--: | :-----: |
| Preaching calendar: sermons scheduled or preached, month by month | Yes | Yes |
| Series pane: sermons grouped by series, ordered by date | Yes | Yes |
| Passage index: every book and chapter preached, with the sermons on it | Yes | Yes |
| Repeat-text warning when a note's passage overlaps one already preached | Yes | Yes |
| Configurable frontmatter keys for series, text, date, and occasion | Yes | Yes |
| Lectionary readings for the Revised Common Lectionary cycle | No | Yes |
| Illustration library with reuse tracking | No | Yes |
| Series planning: map a book across a set number of weeks | No | Yes |
| AI outline suggestions from a passage (bring your own API key) | No | Yes |

## Installation

The Community Plugins listing is pending review. Until it is approved, install with one of these methods:

### Manual install (GitHub releases)

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub release](https://github.com/Arcadia-Studio/obsidian-arcadia-lectern/releases)
2. Create the folder `.obsidian/plugins/arcadia-lectern/` inside your vault and copy the three files into it
3. Reload Obsidian, then enable Arcadia Lectern under Settings > Community plugins

### BRAT

1. Install the [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) plugin
2. In BRAT, choose "Add beta plugin" and enter `Arcadia-Studio/obsidian-arcadia-lectern`
3. Enable Arcadia Lectern under Settings > Community plugins

## Quick start

1. Open Settings > Arcadia Lectern and set **Sermon folder** to the folder holding your sermon notes. Until this is set the plugin stays idle.
2. Give your sermon notes frontmatter. The default keys are `series`, `text`, `preached`, and `occasion`; rename them in settings to match what you already use.
3. Click the book icon in the left ribbon, or run the **Open Lectern sidebar** command.
4. Switch panes with the Calendar, Series, and Passages tabs at the top of the sidebar.
5. Run **Check passage history for the active note** to list every earlier sermon on the same text.

A minimal note looks like this:

```markdown
---
series: Walking in Romans
text: Romans 8:1-11
preached: 2026-10-04
occasion: Sunday morning
---

# No condemnation
```

Several texts in one sermon are separated by semicolons (`text: Isaiah 53:4-6; 1 Peter 2:24`), or written as a YAML list.

## Settings reference

| Setting | What it does |
| ------- | ------------ |
| Sermon folder | Folder scanned for sermon notes, subfolders included. Empty means the plugin stays idle |
| Series property | Frontmatter key holding the series name (default `series`) |
| Text property | Frontmatter key holding the preaching text (default `text`) |
| Date property | Frontmatter key holding the date preached or scheduled (default `preached`) |
| Occasion property | Frontmatter key holding the occasion (default `occasion`) |
| Default pane | Which pane opens first: Calendar, Series, or Passages |
| Warn on repeated passage | Shows a notice when an opened note's text overlaps one already preached |
| Lectionary year | Premium. Revised Common Lectionary cycle: A, B, or C |
| Illustration folder | Premium. Folder scanned for reusable illustrations |
| License key | Premium license entry and validation |

## How passages are matched

References are parsed into book, chapter, and verse range. Overlap is judged at the narrowest level both references share: `Romans 8:1-11` and `Romans 8:9` overlap, `Romans 8` overlaps every verse in the chapter, and a bare `Romans` overlaps the whole book. Book names are compared with abbreviation periods and extra whitespace removed, so `1 Cor.` and `1 Cor` are the same book. An unparseable reference is kept verbatim rather than dropped, so it still appears in the index.

## Development

```bash
npm ci          # install from the committed lockfile
npm run dev     # esbuild watch, writes main.js
npm run build   # tsc -noEmit, then a production bundle
npm run lint
npm test        # passage parsing and overlap checks, no test framework needed
```

`npm run dev` writes `main.js` beside `manifest.json`, so cloning this repository directly into `.obsidian/plugins/arcadia-lectern/` gives a live reload loop.

Use `npm ci` rather than `npm install`. `package.json` declares `obsidian: latest`, and API typings newer than 1.12.x do not typecheck under the pinned TypeScript 4.7.4; the committed lockfile and the `skipLibCheck` flag in `tsconfig.json` are both what keep the build reproducible.

`npm test` bundles `tests/passages.test.ts` with esbuild, aliasing the Obsidian API to a small stub, and runs it on Node. There is no test framework to install.

## Pricing

Core features are free. Lectionary readings, the illustration library, series planning, and AI outline suggestions require a premium license from [arcadia-studio.lemonsqueezy.com](https://arcadia-studio.lemonsqueezy.com).

To activate: Settings > Arcadia Lectern > License key, then click Validate. Validation is cached for 24 hours, and a 14-day grace period keeps premium features working when you are offline.

## Support

Questions, bug reports, and feature requests: [arcadiastudio77@gmail.com](mailto:arcadiastudio77@gmail.com), or open an issue on the [GitHub repository](https://github.com/Arcadia-Studio/obsidian-arcadia-lectern).

## License

MIT. See [LICENSE](LICENSE).
