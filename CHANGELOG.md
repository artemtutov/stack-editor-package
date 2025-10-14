# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- TipTap rich text editing integration
- Fullscreen editor mode with deep-sync block diffing
- JSON-first storage (contentJson + cachedHTML)
- Link validation and security (rel="noopener noreferrer")
- Mobile-responsive toolbar with safe-area insets
- Task list (to-do checkbox) support
- Slash menu for quick formatting
- Lazy loading for fullscreen editor
- Editor telemetry for performance tracking

### Changed
- Migrated from plain textarea to TipTap rich text editor
- Blocks now store TipTap JSON as source of truth
- HTML is now cached and sanitized for read-only rendering

### Performance
- Supports ~20-30 blocks smoothly (Phase 1 target)
- Future Phase 2 optimizations planned for 200+ blocks

## [0.1.0] - 2025-01-XX

### Added
- Initial release of @stack-editor/react
- Notion-style vertical block stacking
- Drag and drop block reordering
- Keyboard navigation (Tab/Shift+Tab, Enter, Backspace, Arrow keys)
- Customizable block and container renderers
- Integration with @xyflow/react
- TypeScript support with full type definitions

[Unreleased]: https://github.com/artemtutov/stack-editor-package/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/artemtutov/stack-editor-package/releases/tag/v0.1.0
