# Editing and the workspace

## Workspace principles

Keep the chart central and controls compact. Design offers Front, Reverse and, on wider screens, Compare.
Only independent faces are editable. Knit shows the [working chart](charts.md) without editing controls.
Switching workspace or face is temporary and should preserve chart position and selection.

Draw, Select, Shape, Undo and Redo stay near the chart. Project, Pattern and Help open one panel at a time;
small screens use bottom sheets. Closing a panel retains unfinished inputs. Escape closes it and returns
focus to its opener. Language stays available in the header; Print / PDF opens a dialog.
Show advanced settings, detailed image requirements and exact shape values on demand.

Use visible keyboard focus, labelled controls and accessible feedback. Confirmations initially focus Cancel.
Touch swipes scroll without painting. Grid navigation uses one tab stop with arrow-key movement; Space/Enter
acts on the focused cell and Tab leaves the grid. Derived views must not expose colour-editing targets.

## Creating and clearing

New pattern creates a separate browser project, preserving existing saved projects. It initially selects
Mirrored reverse (Plain), 20 × 20 and flat knitting. Users choose relationship, dimensions and workflow;
optional gauge requires both positive values. Blank gauge uses the [display defaults](charts.md#gauge-guides-and-zoom).
Uncommitted work is disclosed before replacement. Accepted creation starts a fresh history.

Clear design requires confirmation and is undoable. It replaces every independent source colour with that
face's base colour, including retained colours under absent stitches. It preserves size, outline, relationship,
workflow and display settings. It does not delete browser projects or restore factory defaults.

## Drawing and selection

A click/tap in Draw swaps one present stitch's actual yarn colour. Independent Reverse edits do not change
Front colours; derived Reverse changes follow Front automatically.
Select uses two corners or Shift+arrows to form an inclusive rectangle in that face's coordinates.
Swap colours toggles only present stitches within it, as one operation. A rectangle may cross absent space;
absence and retained hidden colours are unchanged. Deselect or Escape clears the selection.

Direct navigation accepts displayed row/round and column numbers. Ordinary editing skips absent cells;
Shape can focus absent coordinates. Resize follows the anchored stitch where possible, then moves focus to
a surviving stitch. Shape, resize, relationship changes, project replacement and Undo/Redo clear stale selections.

## Shaping and resizing

Shape always works on Front. Trim edge removes a continuous span from an edge through the pointed stitch;
Restore edge extends presence through the pointed absent stitch. Hover previews the nearest edge (left wins
an equal-distance tie). Click/tap or Space/Enter retains that choice. Selections accumulate across rows and
edges, and later previews use the selected outline. Switching Trim/Restore retains selections.

Apply commits the selected outline once; Cancel/Escape discards it. Leaving the chart clears only the hover
preview. Linked shapes adjust both symmetric edges, while colour edits never mirror the motif within Front.
Exact values accepts inclusive row ranges and cuts measured from the bounding edges. All paths enforce the
[shape rules](pattern-semantics.md#presence-and-shape). Restoring presence recovers retained colours.

Resize applies both dimensions together, within 1–200. It preserves bottom rows, Front's right edge and an
independent Reverse's left edge. Growth adds rows above and columns to Front's left/Reverse's right.
A full rectangle grows with present base-colour stitches; a shaped pattern gains absent padding.
Derived Reverse is recomputed from Front after resizing.

Show before/after outlines. Reject results that remove all stitches or violate shape rules, including linked
symmetry; do not silently recenter a motif to make a resize valid. Cropping any pattern-colour source data
(black Front or white independent Reverse), even beneath absence, requires confirmation. Cropping only base
colours does not. Cancellation preserves source, history and saved data.

## Relationship changes

Changing the [reverse relationship](pattern-semantics.md#faces-and-relationships) requires confirmation and
is one undoable operation. Front, outline, dimensions, workflow and display settings are retained.
Converting to linked is unavailable for an asymmetric outline; do not silently alter its shape.

Converting to independent materializes the currently visible Reverse. Converting to Plain or linked replaces
any independent Reverse with the appropriate derived design. Undo retains the displaced source while that
history entry remains available. Switching back to independent is not restoration of an earlier independent
design; project reload or history eviction removes that route to recovery.

## Undo and operation boundaries

Source edits and project display changes are undoable, including workflow, notation, gauge, guides, shape,
resize, relationships and Clear design. Each accepted operation is committed and saved as a whole; preview,
invalid input, cancellation and no-op changes do not create partial edits.

History is local to the tab: up to 100 operations, further bounded by a 16 MiB serialized-snapshot estimate.
Undo/Redo saves the restored source. Editing after Undo discards the redo branch. New, accepted project/file/image
replacement and reload start fresh history. Names, library creation/deletion and browser preferences are
outside project Undo. See [state ownership](projects-and-data.md#what-belongs-where).
