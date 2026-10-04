# Projects and data

## What belongs where

| State | Lifetime and ownership |
| --- | --- |
| Dimensions, independent colours (including hidden colours), shape, relationship, workflow, gauge, proportions, notation and guides | Pattern source; saved, exported and undoable. |
| Project identity, name and edited time | Browser project metadata; names also travel in editable file envelopes. Outside source Undo. |
| Language; paper, orientation, print cell width and overlap | Separate browser preferences; outside pattern files and Undo. |
| Workspace, face, zoom, focus, scroll, selection, open panels and unfinished forms | Temporary interface state. |
| Undo/Redo | Bounded tab-local history; not included in files or restored after reload. |
| Derived Reverse and combined chart | Recomputed from sources, never stored as redundant designs. |

## Browser projects and recovery

Edits autosave to the active project's stable identity. Renaming preserves identity; Make a copy creates an
independent project. New, editable-file import and image import create separate identities with unique names.
Opening a project makes it active and warns if current work is unsaved. File import uses the name in the file;
image import gets a new automatic name and retains the current display settings and workflow.

Names are trimmed, Unicode-normalized, 1–80 characters and contain no control characters. Duplicate names
compare case-insensitively. Creation/copy chooses a unique name; explicit rename rejects collisions.
Existing names do not change with language selection. Browser storage is local to this browser, not cloud backup.

Deleting a project requires confirmation. Deleting the active entry leaves the chart as a detached draft;
autosave must not immediately recreate the deleted entry. Make a copy saves the draft again. Undo does not
restore deleted library entries. Editable downloads remain the portable backup path.

A separate current-source recovery copy accompanies the project collection. If the restored draft differs
from the recorded active source, preserve both rather than guessing identity from a name or overwriting one.
Current-draft and library writes each check for intervening changes. Corrupt data, unsupported formats,
unavailable storage, quota failures and competing tabs produce persistent warnings even when Project is closed.
Editing and download remain usable when saving fails.

Do not overwrite unreadable or unreviewed stored bytes automatically. Retry cannot bypass this protection;
replacement of protected current data requires explicit confirmation. An initial read failure must be resolved
before existing bytes can be judged safe to replace. Failed replacement keeps protection in place.
Library recovery must not silently switch this tab to another tab's active identity.
These guards detect conflicts; local storage does not provide fully serialized simultaneous-tab writes.

## Editable files

Download editable pattern writes `.doubleknit.json`: the name and complete validated source, including retained
hidden colours and display settings. Import accepts the current versioned envelope or a raw current source.
Raw sources receive a localised default name. Validate content regardless of filename extension.

Files are limited to 1 MiB before parsing. Validate the entire candidate before replacement; invalid files and
cancelled imports leave work unchanged. Accepted import creates a new project and clears history/selection.
It does not grant permission to overwrite protected browser data. Unsupported versions are rejected rather
than silently migrated. Exact current format identifiers are in [development](development.md#source-and-storage-boundaries).
Download initiation is not proof that the browser completed a disk write.

## Starting from an image

Image import is exact pixel art: one pixel per stitch, with no resizing, antialiasing or automatic cleanup.
Choose the reverse relationship before preview. Independent designs require Front and Reverse images with
identical dimensions; Plain and linked require only Front. Both images depict their outward-facing views;
import introduces no extra mirroring.

Accept PNG and static GIF by signature, each at most 8 MiB and 200 × 200 pixels, with nonzero dimensions.
Reject animations, partial transparency and 16-bit-channel PNGs. JPEG is unsupported; explain that the original
pixel art should be saved as PNG, and that converting an existing JPEG may retain unwanted extra colours.
Respect orientation metadata exactly once before interpreting the stitch coordinates.

Each image may contain one or two opaque RGB colours. Fully transparent pixels mean absence and their hidden
RGB values do not count as colours. For two colours, lighter becomes white and darker black, independently
per image, using sRGB relative luminance. Indistinguishable luminance is rejected. One colour becomes white
at luminance 0.5 or higher, otherwise black. This maps actual yarn colours, not face-relative base/pattern roles.

Transparency must obey the [shape rules](pattern-semantics.md#presence-and-shape). Independent Reverse's
mask must mirror Front's; linked Front's mask must be symmetric. Fully transparent images are invalid.
Transparent coordinates receive the face's base colour for later restoration.

Validate all images and show an actual-colour preview before acceptance. Changing files or relationship
invalidates that preview. Nonblank work requires explicit replacement/history-loss consent: “blank” means
fully rectangular and base-filled on all independent faces, regardless of size/settings.
Cancellation, decoding failure, stale asynchronous results and a changed source must not replace current work.
Accepted import starts fresh history and uses the same guarded saving as other project replacement.
