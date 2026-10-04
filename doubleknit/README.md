# Doubleknit

A static double knitting pattern editor with a chart-first workspace, shaped patterns, browser projects,
editable files, PDF printing and pixel-art import. Available in English and Danish.

Serve this directory with any static HTTP server, e.g.:

```sh
python3 -m http.server 8080
```

Open <http://localhost:8080>. No build or dependency installation is needed to use the app.
Vue 3.5.30 loads from a pinned CDN URL. Fresh loading needs internet access; direct `file://` loading is unsupported.

## Using the workspace

Choose **New pattern**, **Open pattern** or **Start from image**. New illustrates three relationships:
Mirrored reverse (Plain), Same design on both sides (linked), and Different designs (independent).
Choose dimensions and Flat knitting / In the round, then Create pattern.

**Design** edits Front or Reverse; Compare shows both on wider screens. A derived reverse is a read-only preview.
**Knit** shows the working chart with its reading legend. Plus is the default for new patterns; Triangle remains
available under View in Knit. Design faces always show actual yarn colours, independent of notation.

Tap a stitch in Draw to swap its colour. Select uses two corners; Shift+arrows also extends a rectangle.
Swap colours changes the selected area; Deselect or Escape removes the selection. Native touch swipes scroll.
Go to a stitch expands numerical navigation. Undo/Redo includes source and display changes, up to 100 operations
within a 16 MiB snapshot estimate. History is local to the tab and starts afresh on project load or reload.

**Shape** offers Trim edge / Restore edge. Hover previews from the nearest edge; click or tap retains a selection.
Select both edges and multiple rows, then Apply shape once or Cancel. Restoration recovers retained colours. Exact
values supports inclusive row ranges. No holes, split rows or interior empty rows are allowed; linked outlines remain
symmetric.

The menu strip groups **Project**, **Pattern** and **Help**. Each arrow opens a panel;
the active item is highlighted and underlined. Click it again or press Escape to close the panel.
On phones, panels open as bottom sheets.

**Pattern** opens **Pattern settings**, with Width and Height grouped under **Chart size**, plus workflow, reverse
relationship and Clear design. Resize previews the outline and confirms colour loss. Relationship changes can be undone.
Clear design preserves size, outline and setup. **Pattern** also contains notation, guide frames and **Use a gauge for
stitch proportions** for every chart and PDF. Gauge is enabled by default for new patterns; existing saved choices are
preserved. Gauge inputs appear when enabled. Optional gauge entry during New pattern enables proportions. Settings are
saved with the pattern. Existing files retain their saved notation.

**Zoom** offers minus/plus, a percentage button that resets to 100%, and Fit in both Design and Knit. It does not
change printing or saved settings. Hovering in Design shows (column, row) beside the chart size.

**Project** lists browser projects with previews and sizes in stitches. Click the title in the header or use the
Project name field to rename the current pattern. Edits autosave to the active project; Rename changes its title,
Make a copy creates an independent project, and Download editable pattern saves a `.doubleknit.json` backup.
Projects are stored in this browser only. File import creates a separate project. Corrupt data, storage failures
and competing tabs show persistent warnings; file download remains available when saving fails.

The **language selector** is always in the top toolbar beside Project, Print / PDF and Help.
**Help** contains shortcuts and storage explanations. The initial language follows the browser;
English is the fallback. Language never changes project source or history. Gauge decimals use a dot in English
and a comma in Danish. The chart limit remains 200 × 200 per face.

**Start from image** accepts PNG or static GIF pixel art, one pixel per stitch, with one or two opaque colours.
Transparency means no stitch. Images are limited to 200 × 200 pixels and 8 MiB each; preview before replacement.
Nonblank work requires explicit consent. Photos, animations and JPEG are unsupported. See the
[image-import rules](docs/projects-and-data.md#starting-from-an-image) for precise rules.

Run model, storage and component-logic checks with Node.js 22 or newer (no npm install):

```sh
node --test
```

See the [editing guide](docs/editing.md), [project semantics](docs/README.md) and
[verification notes](tests/README.md). Source schema v7 and file envelope v1 remain unchanged; older source
versions are rejected without silently replacing unreadable bytes.

## Browser-test tools

The app needs no installed dependencies. Automated browser tests additionally use Playwright, Chromium and
Chromium's Linux libraries. Keep developer tooling outside the repository. The current temporary installation was
created with:

```sh
npm install --prefix /tmp/doubleknit-browser playwright@1.58.2
```

Restore Chromium and its missing shared libraries under `/tmp` after a reboot:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/doubleknit-browser/browsers \
node /tmp/doubleknit-browser/node_modules/playwright/cli.js install chromium
(cd /tmp/doubleknit-browser && apt-get download libnspr4 libnss3)
for package in /tmp/doubleknit-browser/*.deb; do
  dpkg-deb -x "$package" /tmp/doubleknit-browser/deps
done
```

Those two Ubuntu packages were the only missing shared libraries on this machine.
With the static server running:

```sh
PLAYWRIGHT_MODULE=/tmp/doubleknit-browser/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/doubleknit-browser/browsers \
LD_LIBRARY_PATH=/tmp/doubleknit-browser/deps/usr/lib/x86_64-linux-gnu \
node scripts/browser-checks.mjs
```

`CHROMIUM_EXECUTABLE_PATH` can select a system browser instead, but Snap Chromium isolates downloads in its
own filesystem and does not support this suite’s downloaded-file checks with host `/tmp` paths. `CHROMIUM_CDP_URL`
optionally connects to an isolated, already-running Chromium debugging endpoint.
Do not use a personal browsing session for tests. `/tmp/doubleknit-browser` is temporary and may need recreating
after cleanup or reboot. The distro Playwright 1.38.0 package encountered an internal `rimraf` API mismatch;
use the npm package above instead. These tooling changes do not add app installation or build requirements.
The explicit `/snap/node/current/bin/node` path avoids Snap launcher restrictions in sandboxed unit checks.
Browser execution may still require permission outside the sandbox.

## Implementation boundaries

- `src/model.js`: pure source validation, mapping strategy, editing, resize, and coordinate helpers.
- `src/storage.js`: injected storage adapter and recovery state; never stores derived cells or UI state.
- `src/projects.js`: versioned file codecs and naming.
- `src/workspace-storage.js`: active project identity and guarded library writes.
- `src/project-controls.js`: project browser, autosave and file controls.
- `src/raster.js`: raster container checks, colour/shape validation and source construction.
- `src/raster-decode.js`: local browser decoding with exact orientation handling.
- `src/raster-controls.js`: cancellable image selection, previews and confirmed replacement.
- `src/app.js`: Vue orchestration; `commit` is the single source-change and save boundary.
- `src/shape-controls.js`: exact row-range cuts; `src/shape-editing.js`: immutable edge previews.
- `src/display.js`: display validation, gauge geometry and reusable guide boundaries.
- `src/display-controls.js`: transactional gauge/guide inputs and presentation toggles.
- `src/i18n.js` and `src/messages.js`: independent language preference, message descriptors and English/Danish text.
- `src/bootstrap.js`: localised startup text before the CDN request.
- `src/workflow.js`: shared workflow names, row/round terms and reading explanations.
- `src/notation.js`: shared face roles, compact pair semantics and screen styles.
- `src/legend.js`: shared HTML/PDF knitting instructions and notation samples.
- `src/chart.js`: chart presentation, selection and spatial navigation; C has no colour-editing handlers.
- `src/history.js`: bounded session-only immutable project history.
- `src/selection.js`: inclusive source-coordinate rectangle helpers.
- `styles.css`: gauge-sized cells, guide overlays and independently scrolling chart containers.

Source operations return new projects without mutating earlier snapshots. Unchanged rows can be reused by the
renderer. History wraps `commit`; file loading validates the entire candidate before reaching it.

## PDF export

Choose Print / PDF to download A for Plain or C in the saved notation for Double-faced projects. The dialog shows
paper, orientation, actual cell dimensions and page count. Single-page previews include the legend below or beside
the chart; both arrangements are tried before reducing the chart or adding a separate legend page. Cells default to 4 mm wide, with readable reduction
for single-page fitting or fixed-scale tiling with two muted cells from each neighbouring page on every shared edge. An opening legend/assembly map accompanies
tiled charts; its page boxes preview the pattern and enabled guide grid. Empty shape tiles are skipped and original
coordinates remain intact. Print at 100% / actual size.

The project’s shared proportions setting also governs PDFs. Paper and page-layout preferences are remembered
in this browser. Paper initially defaults to A4, or Letter
when the browser supplies an appropriate explicit region; UI language does not select paper. A3 and US Tabloid
(11 × 17 in) are also available. Overlap options appear only for tiled charts. Download initiation closes the dialog;
errors leave it open for retry.
[jsPDF 4.2.1](https://github.com/parallax/jsPDF) loads on demand from a pinned CDN URL; the bundled Noto Sans
font is embedded for English/Danish text. Unsupported title glyphs are reported rather than silently replaced.
Project data is processed locally and is not sent to the CDN.
