# How Doubleknit works

Doubleknit is a browser editor for two-colour double knitting. It separates the designs seen on the two
outward-facing sides from the working chart used to knit them. These documents describe intended behaviour
for developers and agents maintaining the project.

## Read by topic

| Guide | Owns |
| --- | --- |
| [Pattern semantics](pattern-semantics.md) | Faces, relationships, stitch pairing, coordinates, shapes and workflow. |
| [Charts](charts.md) | Working notation, reading rules, gauge and guide frames. |
| [Editing](editing.md) | Workspace, creation, colour edits, shaping, resizing, conversions and Undo. |
| [Projects and data](projects-and-data.md) | Autosave, recovery, state ownership, editable files and image import. |
| [Printing and language](printing-and-language.md) | PDF layout, print preferences and localisation. |
| [Development](development.md) | Architectural constraints, verification and maintaining these guides. |

The [project README](../README.md) provides a user introduction and run/tool setup instructions.

## Product principles

- No installation, build step or backend is required to use the app. Serve static files over HTTP(S).
  Fresh loading needs internet access for pinned CDN dependencies; offline use and `file://` are unsupported.
- Project data and images are processed locally. They are not uploaded to the dependency CDN or a service.
  The app does not intentionally set cookies.
- Keep the chart central. Group controls by task and reveal detail when needed, including on small touch screens.
- Preserve user work. Invalid operations and cancelled previews do not partially change a pattern;
  failed saving remains visible and must not silently overwrite protected data.
- Keep design colours, physical stitch relationships and chart notation distinct. Screen and PDF must agree.
- Support keyboard operation and English/Danish feedback alongside pointer and touch use.

## Authority and limits

Each topic has one home here; link to its rules instead of duplicating them. These are current behavioural
contracts, not a development sequence. Superseded specifications and UI proposals remain in Git history.
Code and tests provide evidence of behaviour, but an implementation discrepancy is not automatically a new
requirement. Raise consequential ambiguities before changing behaviour; report smaller discrepancies explicitly.

The working stitch-pair convention remains provisional pending practical knitting feedback. The current
200 × 200 face limit is a supported product boundary, not a claim that every possible knitted construction is
modelled. Drag painting, edge dragging, selection fill and row-progress tracking are possible future work,
not current requirements. Other-browser, screen-reader and physical-print validation must not be inferred
from automated Chromium or PDF-engine checks.
