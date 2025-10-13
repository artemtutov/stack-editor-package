Title: Fullscreen Rich Text Editor (Tiptap) — Implementation Contract

Scope
- Fullscreen only via Stack → Fullscreen path. No demo route; mounted from `StackContainer` and takes over the viewport (scoped under `.tt-shell`).
- Canvas cards: Keep `TipTapEditor` for cards; share the same schema via `createEditorExtensions()`.

Features (enabled)
- Formatting: Bold, Italic, Underline, Highlight (single color toggle).
- Headings: H1–H3 (dropdown).
- Lists: Bullet and Ordered.
- Blockquote.
- Text alignment: Left/Center/Right/Justify (heading/paragraph types only).
- Links: Insert/edit via popover; validate https/mailto; rel="noopener noreferrer"; openOnClick=false in edit.
- Undo/Redo with tuned history depth.
- Placeholder text for empty state.
- Responsive, dark/light mode.
- Slash menu: @tiptap/suggestion-based, '/' trigger; commands above.

Explicitly excluded
- Images (including upload flows).
- Code block and syntax highlighting.
- Color picker for highlights.
- Task list.

Data & Infra
- Source of truth per block: `contentJson` (Tiptap JSON). Persist `cachedHTML` only for read-only.
- Schema parity: `createEditorExtensions()` used by both canvas and fullscreen; versions locked.
- Block unit: one block = one top-level node.
- Block identity for diffing: A `blockId` attribute is attached to top-level nodes in the fullscreen doc only (JSON attr, not HTML). It is stripped before persisting each block’s JSON.
- Link sanitization: Persist-time sanitizer restricts to https/mailto and adds rel for target _blank.

Key Files
- src/renderers/FullscreenStackEditor.tsx — Fullscreen editor integrated with stacks (assemble/split by `blockId`), dev-only identity assertions, history reset on save.
- src/editor/extensions.ts — Shared extensions (H1–H3, underline, highlight, link, text-align scoped, placeholder, trailing-node, tuned history, BlockIdentity; codeBlock off).
- src/extensions/BlockIdentity.ts — JSON-only `blockId` attribute on top-level nodes.
- src/extensions/SlashCommands.ts — Suggestion-based slash menu, renders `SlashMenu`.
- src/utils/sanitizeHTML.ts — Sanitized output for read-only.
- src/styles/fullscreen-editor.scss — Scoped under `.tt-shell`.

Toolbar Composition
- Undo/Redo
- Heading dropdown (H1–H3)
- List dropdown (bullet/ordered)
- Blockquote
- Inline: Bold, Italic, Underline, Highlight toggle
- Link popover
- Text Align (L/C/R/Justify)
- Save/Cancel controls (host wires persistence)

Slash Menu Behavior
- Trigger: '/' key (Suggestion-based)
- Renders `SlashMenu` at caret; executes commands

Integration
- Open: `StackContainer` composes blocks → doc, attaches `blockId` on each top-level node, mounts `FullscreenStackEditor`.
- Save: `FullscreenStackEditor` splits doc → blocks, strips `blockId`, and calls `replaceStackContent(stackId, [{ id?: string, content }])`.
- Diff: `replaceStackContent` creates/updates/deletes/reorders by `id` (missing id = new block); keeps stack layout.
 - Lazy-load: `FullscreenStackEditor` is lazy-loaded in `StackContainer` to keep canvas bundle small.

Definition of done
1) Open via real stack → fullscreen shows a single doc in order.
2) Save updates content & order by `blockId` diff; layout unchanged.
3) Cancel makes no changes.
4) Round-trip preserves H1↔H2, paragraph↔list, blockquote.
5) Multi-paragraph paste in fullscreen becomes multiple blocks on Save.
6) No CSS bleed outside `.tt-shell`.

Block unit contract (add to README/plan)
- One block = one top-level node. Lists are whole-list blocks; do not split individual list items.
- `blockId` exists only in fullscreen JSON for diffing and is stripped from per-block JSON and all HTML.

Paste policy
- Keep: paragraphs, headings, lists, blockquotes.
- Strip: images and task checkboxes while those features are disabled.

Schema versioning
- Store `schemaVersion` per block. Lock @tiptap/* versions in package.json.
- When changing the extension set or schema, bump `CURRENT_SCHEMA_VERSION` and add a small upgrader that normalizes existing JSON to the new schema.
