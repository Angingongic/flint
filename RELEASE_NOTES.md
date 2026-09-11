# Flint 0.1.6

## Library & Study Polish

- Study All cards or Starred only in Flashcards, Learn and Test, with separate Learn session progress.
- Clear cards-used versus generated-question counts. Each matching board remains one question.
- Matching keeps normal touch scrolling outside the grip, keyboard movement and controlled edge scrolling while dragging.
- Arrange sets and folders using Manual order; automatic sorts preserve that order.
- Move sets between folders and the Library, or drop in a set's center to confirm folder creation.
- Pin sets and folders, choose folder colors, and open the same actions with right-click or the existing menu.
- Integrated folder breadcrumbs and browser back navigation.
- Front/Back editor terminology, complete side swapping with Undo, and a shared Image/Audio Insert menu.
- Media answer choices and image loading/error presentation improvements.

This release follows the already-published internal 0.1.5 (displayed as 0.1.4a). No new media formats, recording, autoplay behavior, database migrations, updater keys or release infrastructure are introduced.
Manual order and folder appearance are stored locally on this installation; set pins use existing set metadata.

Windows installers are not Authenticode-signed and may trigger SmartScreen. macOS builds are ad-hoc signed and not notarized; Gatekeeper restrictions remain. Updater artifacts are signed by the existing GitHub Actions signing configuration.
