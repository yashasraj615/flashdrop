# Clipboard UI refinement — 9 November 2026

## Design and accessibility references

- [WAI-ARIA toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/): related controls form groups, one toolbar entry point, arrow-key movement and clear accessible names.
- [Base UI Menu](https://base-ui.com/react/components/menu): keyboard-operable action menus with portaled positioning, group labels, focus return and collision handling.
- [Base UI Select](https://base-ui.com/react/components/select): custom-styled value selectors with native button semantics and keyboard selection. Implemented against the already-installed package's type declarations and source; no new production dependency.

## Changes

The clipboard now has a document header and clear paste/copy actions, a compact grouped icon toolbar, separate Insert/Transform/File menus, an on-demand labeled find/replace panel, a flat writing surface and a quiet statistics footer. Native format/lifetime dropdowns were replaced by consistently styled Base UI selectors. Undo and selection formatting remain available; edit history now survives switching to Preview and back. Local drafts remain opt-in and tab-local.

Menu groups include their required Base UI context and labels. Toolbar buttons expose accessible names, disabled history states, focus indicators, and arrow-key navigation. Touch controls have larger target sizes. Menus use portals and viewport collision handling; search fields have labels, icons and visible focus states. The old disconnected pill-button styles were removed.

Quick Transfer has an explicit All transfer modes control in its historical frame. On the home selector it resets mode and atmosphere without a page reload; direct share pages link home. The button is disabled during upload/completion so it cannot silently interrupt transfer work; Cancel restores navigation. Only a frame busy-state context was added to the Quick component—its upload/download architecture remains unchanged. This explicitly authorized navigation change is excluded from old source-parity checks; unaffected historical files remain checked.

Media previews now contain the entire frame instead of cropping images and display the decoded original dimensions for supported images/videos. No encoding, upload, download, storage, quality, MIME or byte-format implementation changed. Browser thumbnails are previews; the shared source file remains the original.

The logo uses existing higher-resolution assets through a density-aware srcset, a larger header mark, clearer wordmark weight and subtle edge contrast. The artwork/identity was preserved; no artificial detail or new logo was generated. The author credit moved from a fixed overlay into document flow so it cannot cover the editor on small screens.

## Verification

- 102 unit/regression tests in 20 files pass; type checking and production build pass. Lint has zero errors and 17 existing warnings.
- Real Chrome at the annotated 1073×864 viewport and at 390px mobile width verified Quick back navigation, selected-text bold formatting, undo, transforms, find/replace, custom selectors, and menu bounds. No runtime errors or horizontal overflow.
- Additional browser checks verified active-upload navigation guard, cancellation recovery, arrow-key toolbar movement, Escape focus return, and a 3840×2160 uncropped media preview.
- A controlled 3840×2160 PNG (1,738,927 bytes) was encrypted, uploaded through the existing media API to the configured private Neon bucket, downloaded and decrypted. Its full SHA-256 matched the original and the downloaded PNG still reported 3840×2160. The check also verified attachment filename, ciphertext content type/cache headers, original link/expiry and access checks. Test records used five-minute lifetimes and normal cleanup. No company files or security controls were used.
- `scripts/smoke-upload.mjs` accepts `SMOKE_MODE=media` and `SMOKE_MEDIA_FIXTURE=/absolute/path/original.png` to reproduce the original-image checks; signed URLs/secrets are not printed.

GitHub/production receipts are reported after the final push and service confirmation.
