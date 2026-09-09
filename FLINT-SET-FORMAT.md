# Flint portable sets — format version 1

`.flint` is a single-set ZIP archive, shared unchanged between Windows and macOS. It is not `.flintbackup`, which restores an entire library.

## Contents

- `manifest.json`: UTF-8 JSON `{ "format": "flint-set", "version": 1, "deck": { ... } }`. The deck uses Flint's existing camelCase native model, including cards, scheduling values, cover, source attribution, favorite state, creation time and metadata (description, folder, tags, starred card IDs).
- `media/<filename>`: referenced PNG, JPEG or WebP bytes. Built-in covers retain their stable `flint:preset/<name>` identifiers and need no external resource.

The importer accepts no other entry paths, executables, scripts, URLs, duplicate entries or duplicate card IDs. It never extracts archive-supplied paths to disk. JSON is deserialized as data and all displayed text is React-escaped.

Limits: 10,000 cards, 100 MiB total archive/expanded payload, 25 MiB per entry, 1 MiB metadata, 100,000 bytes per card side. Images are decoded for validation with an 8192×8192 dimension limit and a 256 MiB decoder allocation limit. Unsupported versions, malformed metadata, damaged archives/images and missing media produce an import error.

## Preview and persistence

Rust retains one validated package with an opaque preview token. React receives the set summary and media needed for the cover/first five cards. Confirmation submits only the token, so changing the source file after preview cannot change the imported contents. Cancel discards the package; a successful token cannot be used twice.

Import generates fresh set/card/media IDs, remaps starred cards, retains content and scheduling metadata, and clears trash/archive status so the copy appears in the Library. Duplicate names and IDs produce a visible warning. Database insertion uses the existing transaction; newly written media is removed if insertion fails. No original set is overwritten. There is no schema migration (schema remains version 5).

Export builds and validates the archive before atomically replacing the chosen destination via a sibling temporary file. Original media bytes are preserved, not converted.

## Opening files

The bundle declares `.flint` associations. Windows startup arguments and the single-instance callback queue files; macOS `RunEvent::Opened` queues file URLs. The frontend drains the queue after subscribing and opens previews sequentially. Importing via the Import page uses the same preview path.

Association registration requires installing the new Windows build or registering the macOS app with Launch Services. Existing default-app choices may require choosing Flint through Open With.

## 0.1.3 verification

- Rust round-trip tests use actual PNG/WebP bytes and reopen SQLite after two duplicate imports, checking content, creation time, stars and media.
- Rust rejects corrupt images/archives, unsafe paths, unsupported versions, duplicate IDs, missing media, and invalid metadata.
- React tests cover conflict warnings, preview-before-confirm, token confirmation, cancellation, keyboard pairing/unpairing, one-to-one reassignment and Test result persistence.
- Browser QA: a three-card matching test accepted pair changes without leaking correctness and scored one correct/two incorrect, showing submitted and correct answers.

Platform limitation: macOS packaging and installed Windows/macOS file-association launches have not been runtime-verified in this patch. The existing universal macOS/Windows Actions matrix remains enabled. No release is published by preparing this patch.
