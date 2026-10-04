# Guidance for developers and agents

Read the [topic index](README.md) and the affected semantic contracts before changing behaviour. Check the
current implementation and tests, including uncommitted changes; preserve unrelated work. If they disagree
with intended behaviour, report the discrepancy instead of quietly choosing one as authoritative.
Keep dependent topics in sync and resolve consequential design questions before implementation.

## Architectural constraints

The application remains static browser JavaScript with no installation/build step or backend. Vue and the
on-demand PDF dependency load from pinned CDN URLs. Developer tools may require installation, but remain
separate from the app and outside the repository where practical.

Source transformations return new validated projects without mutating earlier snapshots. Shared unchanged
rows are immutable. Accepted operations pass through the application commit boundary for history, saving,
selection and focus handling. Imports validate fully before reaching it; asynchronous previews must not
commit stale results. Derived data and rendering caches must reflect relationship, presence, workflow,
notation and language wherever those affect their result.

Keep one definition of pair semantics for screen, accessibility descriptions, legends and PDF. Keep physical
mapping separate from working direction and visual notation. Do not reconstruct printable content from the
screen DOM. Persistence failures must not prevent in-memory editing or bypass protected-data checks.

## Source and storage boundaries

Current source schema is v7 with mapping `mirrored-ba-v1`; editable-file envelope and library versions are v1.
Only current source versions are accepted. Do not add an implicit migration or change a format without explicitly
reviewing compatibility and recovery behaviour.

Source stores dimensions, workflow, mode/relationship, independent colour arrays, `maskA` row spans and display
settings. Plain omits both independent B and the linking field; linked Double-faced omits independent B;
independent Double-faced requires B. Reverse masks and combined charts are derived. A mask row is either
`null` or `[left, rightExclusive]`; colour arrays retain the full bounding rectangle. Validate conditional fields
as well as dimensions and shape. Names live in library/file metadata, not source.

`doubleknit.currentProject` is the recovery source; `doubleknit.namedProjects` owns library entries and active
identity. `doubleknit.language` and `doubleknit-print-preferences` are separate preferences. See
[state ownership and recovery](projects-and-data.md) before changing any write path.

## Verification

Run `node --test` with Node.js 22 or newer. In environments where the Snap launcher or test-process isolation
causes trouble, use `/snap/node/current/bin/node --test --test-isolation=none`.
Use meaningful asymmetric examples to catch missing/double mirroring; check all four yarn pairs, both workflows,
all relationships, absence versus white, retained hidden colours, Undo and save/file round-trips as applicable.
Exercise cancellation, invalid input, storage failures and competing tabs when touching state boundaries.

For UI changes, serve the app and run `node scripts/browser-checks.mjs` with the external tooling described in
the [README](../README.md#browser-test-tools). Omit `BROWSER_CHECK` for all current groups or select:

| Group | Focus |
| --- | --- |
| `workspace` | Desktop/touch workspace, keyboard, selection and shape transactions. |
| `flows` | Project lifecycle, conversions, downloads/imports, language and recovery. |
| `scale` | 200 × 200 patterns across relationships and notations. |
| `corrections` | Naming, gauge, direction guides, zoom, shaping and paper choices. |
| `legend` | Shared knitting legends across modes, workflows, notations and languages. |
| `pdf-layout` | Measured legends, landscape layouts, previews and PDF downloads. |

Visually inspect relevant desktop and narrow touch states as well as automated results. Large-pattern checks
should include synchronous saving; single edits, single-edit Undo and navigation target under one second on
the reference desktop setup, resize and whole-face Undo under three seconds. Broad colour operations and
notation/workflow/language switches are measured without a one-second gate. These are local regression targets,
not cross-device guarantees.

For PDF changes, check output with independent PDF engines as described in [verification notes](../tests/README.md),
including glyphs, bounds, readable scale, guides and tile coverage. Changes to the bundled font or translated
characters may require regenerating the checked-in font metrics. Chromium and PDF-engine results do not replace
other-browser, screen-reader or physical-print checks. Historical test counts and timings are evidence for their
dated runs, not current acceptance claims.

## Maintaining the documentation

Update the owning topic when a behaviour changes. Preserve examples and boundaries that prevent semantic mistakes;
leave function inventories, algorithm internals and exact test fixtures in source/tests. Keep run/tool instructions
in the root README and verification evidence in tests. Avoid stage numbers, completed roadmaps and appended
“supersedes” sections: rewrite the rule so readers have one current answer.
