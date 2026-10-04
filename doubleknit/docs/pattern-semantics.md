# Pattern semantics

## Faces and relationships

Front (A) and Reverse (B) show the fabric from their respective outward-facing sides. Both use the same two
yarns. Source values are actual yarn colours: white is 0, black is 1. White is a stitch, never empty space.
Front's base colour is white and its pattern colour black; Reverse's base is black and its pattern colour white.
“Base” and “pattern” therefore describe a colour's role on a particular face.

All patterns have one of three relationships:

| UI choice | Reverse design | Editable sources | Working chart |
| --- | --- | --- | --- |
| Mirrored reverse (Plain) | Inverse colours of horizontally mirrored Front | Front | Front |
| Same design on both sides (linked Double-faced) | Inverse colours of Front, without mirroring | Front | Combined pairs |
| Different designs (independent Double-faced) | Independent outward-facing design | Front and Reverse | Combined pairs |

“Same design” means the same motif orientation in opposite colours, not identical yarn colours.
For Front `001`, Plain Reverse is `011`, while linked Reverse is `110`.
Derived reverses are available as read-only design previews. Only independent sources are stored.
Changing relationships is described under [editing](editing.md#relationship-changes).

## Coordinates and physical pairing

Faces share a bounding width W and height H, each from 1 through 200. Displayed columns count from one at
the left of each view; knitting rows/rounds count from one at the bottom. Empty outer padding still counts.
For code and formulas, `x` runs left to right and `y` top to bottom from zero; row number is `H - y`.

Reverse must be mirrored into Front's physical coordinates before pairing:

```text
Plain:       B[y][x] = 1 - A[y][W - 1 - x]
Linked:      B[y][x] = 1 - A[y][x]
Independent: B[y][x] is independently stored

Pair at Front (x, y): A[y][x] and B[y][W - 1 - x]
Logical left-to-right stitch placement within that pair: B, A
```

Resolve the outward-facing Reverse first, then apply the physical mirror exactly once. Pairing never
inverts yarn colours. All four yarn combinations are valid. For example, independent Front `001` and
Reverse `100` give paired left-to-right stitches `00 00 11`; omitting the mirror gives a different result.

The combined working chart (C) displays W pair columns, each representing two stitches. It is derived and
read-only. The logical two-stitch placement is not an expanded chart option. Plain uses Front directly as
its working chart; its inverse reverse is implicit.

This fixed B,A convention is a project assumption, not a universal knitting-chart convention. Keep it
explicit and revisable when practical knitting feedback warrants a change.

## Flat knitting and rounds

In fixed Front coordinates, flat knitting works odd-numbered rows right to left and even-numbered rows left to right. With the placement
above, each pair is worked Front then Reverse on odd rows, Reverse then Front on even rows.
In the round, every round reads right to left and works Front then Reverse.

The linked Plus working chart is an exception to fixed-coordinate reading: every row reads right to left,
relative to the face facing the knitter, with base/pattern yarns exchanged on return rows. The identical
outward designs make this equivalent to physical traversal. Triangle retains fixed coordinates and actual
yarn colours for every relationship. See [chart reading](charts.md#working-notation).

Workflow changes reading direction and row/round terminology. It does not reorder, mirror or invert stored
colours, change outlines, or change relationships. The same workflow applies to every chart and PDF.
Design views depict the finished faces; they are not two separate sets of knitting instructions.

## Presence and shape

Presence is separate from colour. A shape has one continuous occupied span per occupied row, with at least one stitch
overall. Fully empty rows, holes and split rows are invalid. Adjacent spans may have different widths and edges; there
is no slope limit.

Reverse presence is always the horizontal physical mirror of Front presence, independently of the colour
relationship. Linked designs additionally require Front's outline to be horizontally symmetric about the
bounding rectangle's centre. Plain and independent designs do not require this symmetry.

An absent Front coordinate means an absent pair. Charts retain its position rather than closing gaps.
Colours under absent coordinates remain stored and are recovered when an edge is restored. Shape editing
changes presence, not motif colours; see [editing](editing.md#shaping-and-resizing).
