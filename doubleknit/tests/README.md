# Current workspace acceptance

The default `scripts/browser-checks.mjs` runner covers the current workspace with five groups:

- `BROWSER_CHECK=pdf-layout`: measured PDF legends, landscape layouts, previews and downloads.
- `BROWSER_CHECK=corrections`: naming, gauge, direction guides, zoom, shaping and paper choices.
- `BROWSER_CHECK=workspace`: desktop/touch layout, keyboard/two-corner selection, shape preview/apply/cancel/Undo.
- `BROWSER_CHECK=flows`: creation, project identity/rename/copy/reload, relationship/resize/clear Undo, shared gauge,
  actual JSON/PDF downloads, image preview/import, Danish and protected/quota storage.
- `BROWSER_CHECK=scale`: shaped 200 × 200 charts in all relationships and both notations, editing/Undo timings,
  proportional working charts and navigation. Single edit and Undo must remain below one second locally.

Omit `BROWSER_CHECK` to run all five current groups. Tool setup remains in the [README](../README.md#browser-test-tools).
The model/storage suite additionally tests active-project persistence, cross-tab identity and protected draft writes.
Verified 2026-09-21: all 99 unit tests and all three current Chromium groups passed. The complete run covered
actual two-tab draft conflicts and file downloads. Shaped 200 × 200 single edits took 49–66 ms and Undo
48–57 ms across the tested relationships/notations; these are local observations. English/Danish phone layouts,
shape preview and print dialogs were visually reviewed.

Current behavioural contracts are in the [project guides](../docs/README.md). Dated results below are historical
evidence, not current requirements or fresh verification of this checkout.

The former UI runner is retained as `scripts/legacy-browser-checks.mjs`; the stage checklists below describe
historical layouts and their original validation, rather than the new UI's selectors.

Current screenshots/downloads are written under `/tmp/doubleknit-workspace*`. Screen-reader and other-browser
validation remain manual. New UI code introduces no installed app dependency.

# Browser acceptance checks

Serve the repository over HTTP and open it in a modern browser with internet access.
The automated `node --test` suite covers model invariants and storage recovery with injected failures.
Use a separate browser profile for these checks so current work is not replaced.

## Automated browser checks

`scripts/browser-checks.mjs` runs acceptance checks using Playwright 1.58.2 and its Chromium browser in temporary,
isolated browser contexts. This is optional developer tooling; it is not needed to run the app or unit tests.
With Playwright and its browser installed, and the static server running:

```sh
node scripts/browser-checks.mjs
```

If Playwright is installed elsewhere, set `PLAYWRIGHT_MODULE` to the absolute path of its `index.mjs`.
`APP_URL` defaults to `http://127.0.0.1:8080`; `PLAYWRIGHT_BROWSERS_PATH` can select an external browser cache.
Screenshots are written to `/tmp/doubleknit-desktop.png` and `/tmp/doubleknit-mobile.png`.

Verified on 2026-09-11: all 36 model/storage/file/display/editing tests and the Chromium acceptance script passed.
The browser run covered desktop keyboard/dialogs, read-only C, reload, resizing and invalid inputs, protected
storage, quota/read failures, 390-pixel touch layout, taps, and scrolling without accidental edits.
Stage 2 checks cover independent snapshots, overwrite cancellation, rename/delete, actual downloaded-file
round-trips, invalid/oversized imports, failed library writes and imports into protected current storage.
The library tests also cover corrupt collections, duplicate names, stable IDs and intervening tab edits.
It also checks that A/B update one frame before C and that rapid edits converge to the latest pattern.
A 200 × 200 desktop resize plus DOM checks took about 1.9 seconds; an edit took about 0.37 seconds in this environment.
These observations are a baseline, not a cross-device performance guarantee. Screen-reader use and other browser
engines have not been manually verified.

## Interactive checklist

1. With no saved item, choose New and confirm Double-faced, then verify white A and black B at 20 × 20 and C at 20 × 20 pairs. Edit both faces and reload.
   C must reflect restored sources, and editing one face must leave the opposite face unchanged.
2. Tab into A: the bottom-right stitch is focused. Tab into B: the bottom-left stitch is focused.
   Arrows move spatially and stop at edges; Space/Enter toggle once, including when held down.
   Clicking a different cell moves the tab stop. Tab leaves each grid in a single step.
   Chart controls appear between the grids in the tab order. C receives focus as a scrolling region and cannot be edited.
3. At 2 × 1, set A to `XO` and B to `OX`. Grow to 3 × 2: bottom A is `OXO`, bottom B is `OXX`,
   with white A and black B top rows. Shrink to 2 × 1 without a confirmation. Shrinking to 1 × 1 prompts.
   Cancel and confirm separately, checking both the chart and `doubleknit.currentProject`.
4. Enter invalid values (0, 201, 1.5, text, empty) and verify labelled field errors with no partial resize.
   Reset is disabled at defaults; otherwise it prompts; Escape/Cancel preserves both faces and storage. Confirm restores defaults and focus.
5. In developer tools, set `doubleknit.currentProject` to malformed JSON and reload.
   Edit the default project: the original stored string must remain intact. Cancel replacement, then confirm it.
   Repeat using an unsupported version or mapping. Reset must disclose replacement before writing.
6. Simulate local-storage read/getter and write failures. Editing remains available, warnings persist,
   and Retry saving writes the current in-memory work after recovery. After an initial read failure,
   existing stored data must require explicit replacement; absent data may resume saving directly.
7. At a 390-pixel touch viewport, verify no horizontal page overflow, fixed 24-pixel cells,
   scrollable charts, reachable controls, and one toggle per tap. A scrolling gesture must not toggle a stitch.
8. Resize to 200 × 200. Check all three chart bounds, scrolling, bottom-edge focus, and editing responsiveness.
   Stage 4 adds the explicit maximum-size regression targets below; larger charts remain deferred.

Check accessible names, reading order, focus visibility, and dialog focus trapping with keyboard and a screen reader.
Row numbers represent knitting rows from the bottom; array/ARIA row indices increase from the top.

## Projects and files checklist

1. Save two differently named patterns; load each and verify that later edits leave both snapshots unchanged.
2. Try overwriting a duplicate name with different casing. Cancel, then confirm; verify only that snapshot changes.
3. Rename using Project name; reject an existing name. Cancel and confirm deletion separately.
4. Export JSON, reset, then import the downloaded file. Confirm dimensions, both faces and generated C.
   Repeat with raw version-7 source JSON; older versions must be rejected.
   Cancelled imports and invalid files must leave storage unchanged.
5. Corrupt `doubleknit.namedProjects` or deny storage access. Named-save controls must explain the failure;
   editing and file export must remain usable. Restore storage and use Reload named saves.
6. Deny named-save writes, including overwrite/delete. Verify the previous stored snapshot remains usable.
   Change the library in another tab, then attempt a write here; reload before retrying.
7. With protected current-project data, import a file or load a snapshot. The source appears in memory while the
   protected bytes remain untouched until the separate replacement confirmation.

## Chart display checklist

Automated stage 3 checks cover gauge ratios 1.5, 0.5 and 2, clamp explanations, invalid-field focus and atomic
validation, square C, mirrored guide coordinates at partial edges, overlay/cell alignment, touch editing through
frames, resize preservation, reload, reset cancellation/defaults, named-save restoration and file round-trips.
Pure tests additionally cover extreme finite gauges, strict v3 validation and rejection of older sources through all load paths
without overwriting unreadable stored data, and pair-aligned guides at minimum/maximum dimensions.
Screenshot: `/tmp/doubleknit-display.png` (390-pixel viewport, proportions and guides enabled).

1. Apply gauge 20 × 30 and enable proportions: A/B are 36 × 24 px, C is 24 × 24 px.
   Apply 40 × 10 and 10 × 40; verify clamping messages and minimum 24 px targets.
2. Enter invalid gauge or guide spacing; Apply preserves the last valid chart and storage and focuses the error.
3. Enable size-10 frames at 23 × 12. A has a partial left frame, B a partial right frame, and C matches A's pairs.
   All have a partial top frame. Scroll horizontally and check sticky row labels, cell/guide alignment and focus.
4. Save/export with non-default settings, reset and reload/import; settings and sources should round-trip together.
   Reject a v1/v2 file without changing current work. Resize preserves settings; reset restores square mode with guides off.

The latest Chromium run also passed the existing desktop/touch acceptance suite and 200 × 200 resize/edit checks.
Screen-reader and other-browser verification remain manual.


## Bulk editing, history and scale

`scripts/editing-browser-checks.mjs` runs as part of the main browser suite. It covers mixed-colour rectangular
selection, reversed corners, Shift+arrows, Escape, touch two-corner selection and swipes without accidental changes.
Checks also cover undo/redo shortcuts and branching, display/reset restoration, refreshed dimensions, cancelled
and accepted imports, protected storage, failed writes and retry, plus direct chart navigation and invalid inputs.
The pure editing tests cover immutable area updates, complete-project history and count/byte eviction limits.

The reproducible desktop case uses Chromium at 1440 × 1000 without CPU throttling, 200 × 200 checkerboard faces,
gauge 20 × 30, proportions enabled and size-10 guides. Each timing starts at dispatch and ends after C matches the
sources and two animation frames settle. Targets are <3 seconds for resize from 199 × 199 to 200 × 200 and whole-face-toggle undo, and
<1 second each for a single edit, single-edit undo and direct navigation.
Whole-face toggles, workflow and notation switches
are measured without a one-second gate. Timing includes synchronous storage.
The script also validates the maximum-size source-file round-trip and checks C navigation against guide coordinates.

Verified 2026-09-11 in the final full-suite run: resize 1,184 ms; single edit 188 ms; whole-face toggle 829 ms;
undo 850 ms; navigation 36 ms. Compact source JSON was 160,968 UTF-8 bytes; the exported envelope was 886,752 bytes,
below the 1 MiB import limit. All targets passed, along with the existing desktop/touch/display/file checks.
These are local regression targets, not cross-device performance guarantees. Manual screen-reader and
other-browser checks remain outstanding.
Screenshot: `/tmp/doubleknit-editing.png`.

## Compact notation (stage 5)

The main browser suite includes `scripts/notation-browser-checks.mjs` and repeats the editing/scale suite for
Triangle and Plus. It covers all four yarn combinations on odd/even rows, asymmetric B mirroring, actual-yarn and
base/pattern labels, preserved source selection/focus, B edits, notation undo/redo, pair navigation bounds,
current-work reload, named snapshots, downloaded-file round-trips and adjacent plus arms with guides on.
Screenshots: `/tmp/doubleknit-triangle.png`, `/tmp/doubleknit-plus.png`, `/tmp/doubleknit-plus-adjacent.png`.

Stage 5 unit verification: 39 tests, including compact semantics and strict schema-v3 validation. Earlier
all-white defaults, expanded-C cell counts, and old-format migration checks above are historical stage baselines.
The current maximum C is 40,000 pair cells representing 80,000 stitches; A/B together contain 80,000 source cells.
Both notation runs measure resize, edit, full-face toggle, undo, notation switching and navigation with storage.
Manual screen-reader and other-browser checks remain outstanding.

Verified 2026-09-19: all 39 unit tests and the complete Chromium suite passed for both notations.
Maximum-size timings (milliseconds; dispatch through matching C and settled frames):

| Notation | Edit | Whole-face toggle | Undo | Resize | Switch notation | Navigate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Triangle | 123 | 929 | 850 | 1,066 | 1,136 | 32 |
| Plus | 195 | 883 | 902 | 1,116 | 917 | 76 |

Triangle source/envelope sizes were 160,990/886,782 bytes; Plus was 160,986/886,778 bytes, below 1 MiB.
Adjacent plus symbols and both triangle directions were also visually reviewed in the touch screenshots.

## Plain mode and creation (stage 6)

Verified 2026-09-19: all 43 unit tests passed. The existing Double-faced Chromium suite passed for both
notations, and `scripts/plain-browser-checks.mjs` passed on desktop and a 390-pixel touch viewport.
It is included in the main browser runner. Coverage includes first-use creation/cancellation, default mode,
Cancel focus, hidden B/C controls, working-row guides, preserved state on cancelled New, mode-preserving Reset,
history, named saves, mode-changing loads, reload, downloaded-file round-trips, contradictory sources,
protected storage, failed writes and retry. Plain screenshots: `/tmp/doubleknit-plain-desktop.png` and
`/tmp/doubleknit-plain-touch.png`; the narrow layout was visually reviewed.

Plain 200 × 200 checks use a checkerboard source, Plus saved but hidden, gauge 20 × 30, proportional cells
and guide frames. Editing, whole-face toggling, undo, direct keyboard navigation and touch scrolling pass.
Timings include synchronous current-storage writes and two settled animation frames:

| Viewport | Resize | Edit | Whole-face toggle | Undo | Navigate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop | 434 ms | 102 ms | 445 ms | 439 ms | 80 ms |
| Touch | 418 ms | 115 ms | 468 ms | 439 ms | 84 ms |

Source v4 requires mode and omits B for Plain. Old sources are rejected with stored bytes protected.
The previous stage results above are historical baselines. Screen-reader and other-browser checks remain manual.

## Identical patterns (stage 7)

Verified 2026-09-19: 47 unit tests and the complete Chromium suite pass.
`scripts/linked-browser-checks.mjs` is included in the main Chromium runner and covers desktop and 390-pixel touch use: both confirmations, Cancel focus, unchanged cancellation,
cleared undo/redo and selections, derived B omission, independent unlinking, linked Reset, reload, snapshots,
downloaded-file replacement, contradictory sources, protected storage, failed writes and retry.
Both notations retain A/C navigation, keyboard editing, area selection and native touch scrolling at 200 × 200.
The source version is now v5; earlier stage format descriptions above are historical.

Linked desktop timings in milliseconds (dispatch through settled frames, including current-storage writes):

| Notation | Resize | Edit | Whole-face toggle | Undo | Navigate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Triangle | 788 | 56 | 762 | 788 | 38 |
| Plus | 656 | 46 | 721 | 702 | 40 |

Both exported envelopes remained below 1 MiB: 443,621 and 443,625 bytes respectively. Plus now draws its
unchanged 3-pixel strokes and insets as centred backgrounds to avoid symbol-element creation on linked edits.
Linked desktop/touch screenshots are `/tmp/doubleknit-linked-desktop.png` and `/tmp/doubleknit-linked-touch.png`;
both layouts were visually reviewed. Other-browser and screen-reader checks remain manual.

## Shaped patterns (stage 8)

Verified 2026-09-19: all 55 unit tests and the complete Chromium suite pass.
`scripts/shapes-browser-checks.mjs` joins the main Chromium runner and covers row-range cuts/restoration, mirrored B presence, both compact notations, linked symmetry,
invalid shape/resize preservation, outer padding, selection clearing, Shift-selection through absence,
all-absent no-ops, nearest-stitch focus, full-project history, downloaded-file replacement, reload and protected
storage. Desktop and 390-pixel touch checks exercise all three source modes at 200 × 200, including bulk
colour edits, undo, direct navigation, shape updates, resize, file size and native scrolling without edits.

The maximum-size shape has spans `[y % 80, 200 - y % 80]`, checkerboard colours, proportional A/B cells and
size-10 guides. Timings include current-storage writes, matching C and settled animation frames; bulk toggles
have no timing gate. Desktop results in milliseconds:

| Mode | Notation | Edit | Whole-face toggle | Undo toggle | Shape | Undo shape | Resize | Navigate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Plain | Actual colours | 83 | 485 | 506 | 69 | 68 | 476 | 82 |
| Independent | Triangle | 117 | 1,001 | 991 | 177 | 190 | 1,355 | 147 |
| Independent | Plus | 163 | 732 | 780 | 157 | 150 | 1,252 | 113 |
| Linked | Triangle | 167 | 705 | 763 | 97 | 96 | 782 | 99 |
| Linked | Plus | 131 | 765 | 792 | 95 | 108 | 813 | 88 |

Schema v6 stores `maskA` row spans, retaining actual colours under absent coordinates; B presence is derived.
Older source versions are rejected with protected saved bytes. Maximum shaped exports were 895,011 bytes for
independent Double-faced, 451,793 for linked and 451,755 for Plain, within the unchanged 1 MiB limit.
Unit tests additionally cover maximum-length Unicode names and rectangular/shaped files in every source mode.
History's existing serialized-size estimate automatically includes spans and retained colours.

Screenshots: `/tmp/doubleknit-shapes-desktop.png` and `/tmp/doubleknit-shapes-touch.png`.
The narrow layout, hatching and outlines were visually reviewed. Other-browser and screen-reader checks remain manual.

## In-the-round workflow (stage 9)

Verified 2026-09-19: all 60 unit tests and the complete Chromium desktop/touch suite pass.
Unit verification used `/snap/node/current/bin/node --test --test-isolation=none` to run individual test cases
inside this sandbox. The main browser runner now includes `scripts/workflow-browser-checks.mjs`.

Coverage includes Plain, independent and linked Double-faced projects, both compact notations, global numbering
through empty padding, unchanged colours/masks/guides, refreshed cached descriptions, preserved selection/focus,
workflow undo/redo, workflow-only Reset enablement, Reset cancellation/restoration, flat New, reload, downloaded
files and protected storage. Additional workflow checks cover round-mode colour edits, resize preservation
and round-specific shape errors. Unit tests also verify independent named snapshots and reject missing/invalid
workflow through every load path. Source v7 requires workflow; older sources remain protected when rejected.

The final full-suite 200 × 200 workflow switches took 400/1,165/778 ms on desktop and 433/1,184/791 ms on touch
for Plain/independent/linked respectively. Workflow and notation switches are measured without a one-second gate.
Per the revised scale contract, whole-face-toggle undo has a three-second limit; single edits, single-edit undo
and navigation retain one second. Rectangular Triangle/Plus edits took 142/133 ms, bulk undo 967/854 ms,
resize 1,348/1,166 ms and navigation 35/33 ms. All existing scale checks passed.

Screenshots: `/tmp/doubleknit-workflow-desktop.png` and `/tmp/doubleknit-workflow-touch.png`.
The narrow workflow layout and right-side round guides were visually reviewed. Other-browser and screen-reader
checks remain manual. PDF labels will be verified when stage 11 implements PDF export.

## Localisation (stage 10)

Verified 2026-09-20: all 67 unit tests and the complete Chromium desktop/touch suite passed, followed by a
focused localisation run covering the final page-scroll preservation and Danish file checks.
`scripts/localisation-browser-checks.mjs` is included in the main runner. Set `BROWSER_CHECK=localisation` to run
only this group with the same browser configuration.

Coverage includes language preference precedence and browser-tag matching, English fallback, dictionary/placeholder
parity, singular/plural counts, document title/language, translated visible/accessibility text and live errors,
open confirmations and Cancel focus, independent failed language storage, protected project data, Danish comma
decimals and preserved invalid drafts. Language changes retain source bytes, chart selections, focus, chart/page
scrolling and names. New uses a translated default name; undo, New, loads and reload preserve language as specified.
Danish downloaded-file round-trips preserve names and numeric sources without adding language fields; invalid-file
feedback changes language live. Both notations and both row/round terminology are covered.

The focused 200 × 200 language switches took 629 ms for Plain, 1,957 ms for independent Double-faced, and 1,427 ms
for linked Double-faced. Language switches, like notation/workflow switches, have no one-second gate. The full
existing suite also passed all editing/resize/history targets: Triangle/Plus single edits took 149/150 ms,
whole-face undo 1,000/920 ms, resize 1,516/1,373 ms and navigation 48/32 ms. These are local observations.

Screenshot `/tmp/doubleknit-localisation-touch.png` shows the Danish reset confirmation at 390 pixels; its text,
buttons and surrounding controls were visually reviewed. Screen-reader and other-browser verification remain
manual. Danish PDF glyphs will be checked in stage 11.

The run used Playwright 1.58.2 and matching Chromium 145.0.7632.6 under `/tmp/doubleknit-browser`, with temporary
`libnspr4` and `libnss3` extracted under `deps/`; see [tool setup](../README.md#browser-test-tools).
The system Playwright 1.38.0 package failed its internal cleanup API, and Snap Chromium's separate `/tmp`
prevented host-side download checks. Neither failure was an application failure.

## PDF export (stage 11)

Verified 2026-09-20: all 74 unit tests and the complete Chromium desktop/touch suite passed.
`scripts/pdf-browser-checks.mjs` is included in the main runner; `BROWSER_CHECK=pdf` selects just this group.
Source/envelope/library versions remain v7/v1/v1. Export settings and the shared C/PDF proportion toggle
are transient and leave saved project bytes, undo history and storage recovery guards unchanged.

Pure tests cover orientation precedence, minimum width/height, reduction, browser-region paper inference,
complete stitch coverage with unique tile ownership, exact overlaps 0–5, empty/overlap-only tiles, white content,
padding coordinates, global guide alignment and shape boundaries distinct from page cuts. Rendering checks
cover both notations, workflows and source modes without mutating inputs.

Browser checks exercise actual downloads, filenames, English/Danish controls and decimals, dialog focus,
390-pixel layout, C proportions, unchanged storage, reload defaults, CDN failure/retry with protected saved bytes,
and coherent source/name/language snapshots. Fixtures include all three modes at 200 × 200, shapes, guides,
minimum 3 mm square and 4 × 2 mm proportional cells, landscape, reduced single pages and long titles.

Downloaded fixtures were checked with independent MuPDF 1.26.7 and PDFium (pypdfium2 5.3.0) engines for page counts,
A4/Letter dimensions, text bounds and Danish glyphs, and rasterized by both. Selected outputs and the mobile dialog
were visually reviewed, including Plus separation, Triangle direction, hatching, guides, outlines and assembly maps.
This is automated engine coverage, not a claim that interactive PDF-viewer interfaces or physical printing were tested.
Screen-reader and other-browser verification remain manual.

Optional PDF verification tools stay outside the application/repository:

```sh
pip install --target /tmp/doubleknit-pdf-tools PyMuPDF==1.26.7 pypdfium2==5.3.0
PYTHONPATH=/tmp/doubleknit-pdf-tools python3 scripts/inspect-pdfs.py
```

Run the browser PDF group first; it writes `/tmp/doubleknit-pdf-*.pdf`. The inspection script writes first-page and
second-page PNGs for each renderer. Dialog screenshots are `/tmp/doubleknit-pdf-dialog-desktop.png` and
`/tmp/doubleknit-pdf-dialog-touch.png`.

The full regression run retained the existing editing targets: Triangle/Plus single edits took 141/134 ms,
whole-face undo 983/901 ms, resize 1,542/1,350 ms and navigation 35/34 ms. These are local measurements.

## Raster import (stage 12)

Verified 2026-09-20: all 80 unit tests and the complete Chromium desktop/touch suite passed.
`scripts/raster-browser-checks.mjs` joins the main runner; `BROWSER_CHECK=raster` selects this group.
Source/envelope/library versions remain v7/v1/v1. No new application dependency is required.

Pure checks cover signature/container and dimension checks before decoding, animation rejection, all eight
EXIF orientations in both byte orders, colour mapping, hidden transparent RGB, partial alpha, invalid shapes,
mirrored masks, mode/linking discrimination, unchanged settings/workflow, blank detection and maximum-size
JSON round-trips. Native browser checks use actual PNG/GIF files and oriented PNG data.

Desktop and 390-pixel touch checks cover first-use import, Cancel focus, preview-only state, nonblank consent,
mode/linking choices, translated live errors, language changes during delayed decoding, cancellation and stale
results, selected-cell/history preservation, accepted history clearing, retained names/settings/workflow,
C/PDF proportions, reload, failed writes/retry and protected saved bytes. All three modes import 200 × 200
images and remain editable/undoable. The final focused run additionally checks indexed PNG decoding, Plus
imports and Danish preview layout after the final error-handling changes.

Screenshots: `/tmp/doubleknit-raster-desktop.png`, `/tmp/doubleknit-raster-touch.png` and
`/tmp/doubleknit-raster-preview-{desktop,touch}.png`. Desktop and narrow previews were visually reviewed.
Other browser engines and screen-reader behaviour remain manual checks.

The full regression retained the existing scale targets: Triangle/Plus edits took 132/133 ms, whole-face undo
983/884 ms, resize 1,380/1,329 ms, and navigation 34/34 ms. These are local measurements.

## UI corrections (September 2026)

`BROWSER_CHECK=corrections` runs the desktop/390-pixel touch checks for header and Project renaming,
optional creation gauge, explicit stitch units, workflow/mirrored row indicators, hover coordinates, transient
zoom/Fit, cumulative trim/restore with Apply/Cancel/Undo, A3/Tabloid choices and PDF-dialog closing.
It also verifies 200 × 200 Fit in Design and Knit and downloads a tiled A3 PDF.
The current runner includes this group by default alongside `workspace`, `flows` and `scale`.

Verified: 105 unit tests, all four browser groups, recovery and two-tab conflicts. The maximum-size cases retain
single-edit and Undo times below the existing one-second limits. Generated A3/Tabloid PDFs and asymmetric
Plus/Triangle fixtures in both orientations were checked with MuPDF and PDFium for dimensions, page counts,
Danish glyphs and text bounds. Assembly previews, muted reciprocal overlaps and phone layout were visually
reviewed. A blocked library download leaves the dialog open and a successful retry closes it.

`BROWSER_CHECK=pdf-layout` checks the 20 × 20 landscape regression in both languages, notations and workflows,
compares planned text against embedded-font measurements, and exercises desktop/touch previews and downloads.
Fixtures and screenshots use `/tmp/doubleknit-pdf-layout-*`; `scripts/inspect-pdfs.py` checks the PDFs with both engines.
Verified 2026-09-30: all 107 unit tests, the corrections and PDF-layout browser groups, and all ten landscape
PDFs in MuPDF/PDFium passed. The side-by-side PDF and Danish phone preview were visually reviewed.
The legend shares measured lines between planning and rendering, and the unit suite covers bounds, readable scale,
orientation and the separate-legend fallback. Other browser engines, physical printing and manual screen-reader
checks remain outside this verification.

Font advance widths are checked in alongside the application. After changing the bundled font or adding characters
to translated messages, regenerate them with `PYTHONPATH=/tmp/doubleknit-pdf-tools python3 scripts/pdf-font-metrics.py`
(requires `fonttools` installed in that temporary tooling directory). No application build step is needed.

## Shared working legend (September 2026)

After restoring the original chart rendering, all 113 unit tests and the `legend` and `pdf-layout`
browser groups passed on desktop and 390-pixel touch. Coverage includes both languages, workflows,
notations, Plain/Double-faced modes, optional gauge, absence, and preserving the original Plus symbols
on both row directions. The 113 unit tests also passed after removing unused translation keys.

The earlier legend implementation's ten landscape PDFs passed MuPDF and PDFium checks; its Plus phone
legend, Triangle desktop legend and rendered Triangle PDF were visually reviewed before the rendering
restoration. Those inspections do not verify the final restored rendering. Browser screenshots use
`/tmp/doubleknit-legend-*`.
