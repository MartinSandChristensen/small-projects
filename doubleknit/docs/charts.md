# Charts and reading

[Pattern semantics](pattern-semantics.md) defines the yarn relationships and physical stitch order.
Design always shows actual yarn colours. Knit is read-only: Front for Plain, or the combined pair chart for
Double-faced patterns. A collapsible legend explains the active notation and workflow.

## Working notation

Double-faced patterns offer Plus and Triangle. Plus is the default for new patterns; existing patterns retain their
saved choice. Switching notation is a saved, undoable presentation change. It never changes source colours, physical
pairing or outline. Reading direction can change for linked Plus. Plain retains the setting but does not use either
notation.

In Triangle, equal-colour pairs are solid; opposite-colour pairs split diagonally. The upper triangle is
worked first. Right-to-left uses Front upper-right and mirrored Reverse lower-left; left-to-right uses
mirrored Reverse upper-left and Front lower-right.

In Plus, the background encodes Front's yarn colour, with a contrasting plus when mirrored Reverse
is white. Symbols do not change with row direction. With different designs, flat knitting reads alternating
sides and uses these instructions in working order:

| Plus symbol | Front facing you | Reverse facing you |
| --- | --- | --- |
| White, no plus | Base, pattern | Base, pattern |
| Black, no plus | Pattern, pattern | Base, base |
| White, black plus | Base, base | Pattern, pattern |
| Black, white plus | Pattern, base | Pattern, base |

Base is white with Front facing you and black with Reverse facing you; pattern is the other yarn.
With identical, unflipped designs (linked Double-faced), Plus reads right-to-left on every row, relative
to the face facing the knitter. Use the Front-facing column on both faces, switching the actual base yarn.
On Reverse-facing rows, a displayed column describes the mirrored physical pair with the faces exchanged.
Triangle always alternates reading sides when flat, even for linked designs; its legend names actual yarn
colours in working order, separately for Front facing you and Reverse facing you.
In the round, all working charts read right-to-left with Front facing you and need only one legend column.

Plain uses only unmarked white (base, pattern) and black (pattern, base) cells.
The screen and PDF share one legend definition: optional active gauge, stitch-pair explanation, workflow,
notation samples in working order, and a no-stitch explanation for shaped patterns. Triangle examples for
flat knitting show right-to-left then left-to-right placements of the same yarn pair.
Working legends do not use internal chart names A, B or C.

For split cells, the lower triangle has the other yarn colour. Plus symbols must remain separated from
neighbouring symbols, cell borders and guide frames, including at the minimum PDF print size.
Absent cells have no yarn fill, triangle or plus; screen hatching distinguishes absence from white stitches.

## Direction and navigation

Design Front places row labels and arrows at the physical working start: alternating sides for flat
knitting, right side for every round. Design Reverse mirrors those positions and arrows. Knit uses the
same directions except linked Plus, which starts at the right on every row. Plain keeps alternating
flat directions. Direction does not affect guide-frame origins or displayed column numbering.

Design navigation uses stitch coordinates; the combined chart uses pair coordinates. Neither uses doubled
column numbers. Hover reports the displayed column and row/round. Chart descriptions and legends explain
face-relative colour roles and working order without treating a symbol as an extra stitch.

## Gauge, guides and zoom

Gauge is stitches by rows/rounds per 10 cm square. The cell width-to-height ratio is rows divided by stitches,
clamped to 0.5–2; the interface explains clamping. Gauge values must be finite and positive.
One saved proportions setting governs Front, Reverse, Knit and PDF. Turning it off makes cells square
without discarding gauge values. Gauge changes appearance, never stitch counts or source colours.

New patterns use gauge 20 × 20 with proportions enabled, so they initially look square. Guide frames default
to off, with spacing 10. Spacing is an integer from 1 to 200; gauge and guide validation are independent.
Guides count displayed stitches or pairs. They originate bottom-right in Front/Knit and bottom-left in
Reverse, include partial frames at bounding edges and remain aligned across absent areas and PDF sheets.

Zoom is temporary and shared by Design and Knit. Fit preserves proportions and does not enlarge beyond
100%; the percentage button restores 100%. Zoom, viewport scrolling and selection never alter PDF geometry.
