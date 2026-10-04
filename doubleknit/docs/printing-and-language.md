# Printing and language

## PDF content

Print / PDF downloads the working chart: Front for Plain, combined pairs in the saved notation for Double-faced.
It includes reading guidance for the workflow and notation, the project name, row/round coordinates and enabled
guides. It does not print the editor interface or use screen zoom, selection or the scrolled viewport.

Capture source, name, language and layout together before asynchronous generation. Subsequent changes must not
leak into that PDF. Generate locally; the PDF library is loaded on demand from a pinned CDN. A bundled font
supports English/Danish. Unsupported title glyphs produce an error instead of silent substitution.

## Layout and scale

Paper choices are A4, A3, US Letter and US Tabloid. Orientation may be automatic, portrait or landscape; an
explicit orientation is respected. The initial paper choice uses an explicit browser region when available,
otherwise A4. Changing UI language does not choose a paper size.

Requested cell width defaults to 4 mm. The pattern's [proportions setting](charts.md#gauge-guides-and-zoom)
determines height. Minimum readable dimensions are 3 mm wide and 2 mm high; reject a requested size below
either limit. These are chart-reading dimensions, not a promise to print at the physical knitted gauge.

Try a single chart page with the legend below or beside it, preserving requested scale where possible, then
reduce only within the readability limits. Otherwise use requested-scale chart sheets and an opening
legend/assembly page. Automatic orientation favours a readable single page, then fewer pages for tiled output.
The dialog shows actual cell dimensions, page count and the first chart sheet's placement; a separate opening
legend/assembly page is not shown in that thumbnail.

Trim unused outer bounds for printing without renumbering source coordinates. Every present stitch/pair must
belong to one primary sheet region. White stitches count as content. Skip regions with no owned stitches;
overlap alone must not create a sheet. Tile ordering starts at the bottom-right and proceeds left, then upward.

Overlap defaults to two cells, adjustable from zero to five. Each interior edge repeats the neighbouring cells
in muted form, retaining global coordinates and guide alignment. The opening assembly map previews the pattern
and guides and identifies chart sheets. Paper cuts must remain distinct from the actual shape outline.
Hide overlap controls when tiling is unnecessary; an irrelevant invalid overlap draft must not prevent export.
Print at 100% / actual size.

## Print preferences and failure

Paper, orientation, requested width and overlap are browser preferences shared across patterns, not project
source or history. Failure to store these optional preferences does not block printing. Proportions always come
from the current pattern, not from an independent print override.

Successful download initiation closes the dialog and restores focus. Preparation/download errors leave it open
for retry without changing the pattern. As with editable files, the app cannot confirm the browser's final disk write.

## Language and numbers

Support British English and Danish. Resolve language from a saved explicit choice, then the first supported
browser language, then English. Browser regional variants match their base language. Automatic detection does
not itself write a preference. A failed preference read/write leaves the selected in-memory language usable.

Changing language updates visible text, accessible labels, errors, confirmations and row/round terminology.
It does not alter sources, history, names, selection or geometry; retain focus, input carets and scroll position
where translation changes layout. User project names and filenames are data, never translated. Only newly
assigned default names use the selected language.

Gauge and print-width inputs accept positive ungrouped decimals: dot in English, comma in Danish. Reject
mixed separators, grouping and exponent notation. Stored numeric values remain language-independent.
Committed gauge values reformat on language changes; unfinished gauge drafts remain as typed and are validated
in the newly selected language when applied. Print width reformats when its current text parses successfully.

Messages use complete translated phrases with named arguments. Missing Danish translations fall back to English;
missing English messages or arguments are defects. PDF uses the language captured at download initiation,
independently of later UI changes.

The HTML and PDF working legends use the same translated instructions and samples. Gauge is included only
when proportions are enabled, followed by the stitch-pair explanation and workflow instructions. Plain,
Triangle and shaped patterns retain their relevant explanations; internal A/B/C names are omitted.
Plus symbols retain their appearance. Screen and PDF use the same relationship-aware reading directions:
linked Plus reads right-to-left on every row; Triangle and independent Plus alternate sides when flat.
Flat independent Plus and all flat Triangle legends separate Front-facing and Reverse-facing instructions.
Triangle labels use actual yarn colours; Plus labels use base/pattern roles.
