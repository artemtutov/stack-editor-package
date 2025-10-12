# TipTap Integration Plan

## Overview

This document outlines the phased approach to integrating TipTap rich text editing into the stack editor package. The implementation is split into two phases:

- **Phase 1**: Simple MVP with production-ready foundations (~2-3 days)
- **Phase 2**: Production optimizations for 200+ blocks (~1-2 weeks)

---

## Phase 1: MVP with Production-Ready Foundations

**Goal:** Get it working. Prove the concept. Ship fast with solid foundations.

### 1. Install Dependencies

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-highlight @tiptap/extension-placeholder
npm install dompurify
npm install --save-dev @types/dompurify
```

### 2. Architecture Decisions (Must Make Now)

#### A. Stable Block IDs
- Every block must have a stable `id` (use uuid)
- Even though we start with HTML storage, IDs are needed for:
  - Pooling in Phase 2
  - Caret memory
  - Diffs and state management

#### B. List Semantics Decision

**Option A: One block = whole list** (RECOMMENDED)
```
block_1: <ul><li>Item 1</li><li>Item 2</li></ul>
```
- ✅ Simpler (fewer editors)
- ✅ Easier conversions
- ✅ Better performance
- ❌ Less Notion-y drag behavior

**Option B: One block = one list item**
```
block_1: <li>Item 1</li>
block_2: <li>Item 2</li>
```
- ✅ More Notion-like
- ✅ Card-level drag works
- ❌ Harder conversions
- ❌ More complex state management

**Decision:** Choose Option A for Phase 1. Can migrate to B in Phase 2 if needed.

### 3. Create HTML Sanitizer (`src/utils/sanitizeHTML.ts`)

```typescript
import DOMPurify from 'dompurify'

// Allowlist: only marks and blocks we support
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 'mark', 'code', 'a',
  'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3'
]

const ALLOWED_ATTR = ['href', 'target', 'rel']

export function sanitizeHTML(html: string): string {
  // Configure DOMPurify
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  })

  // Normalize tags: <b> → <strong>, <i> → <em>
  return clean
    .replace(/<b>/g, '<strong>')
    .replace(/<\/b>/g, '</strong>')
    .replace(/<i>/g, '<em>')
    .replace(/<\/i>/g, '</em>')
}

export function sanitizeAndSave(html: string): string {
  const sanitized = sanitizeHTML(html)
  // Validate not empty
  if (!sanitized.trim() || sanitized === '<p></p>') {
    return '<p></p>'
  }
  return sanitized
}
```

### 4. Create CanvasKeymap Extension (`src/extensions/CanvasKeymap.ts`)

```typescript
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface CanvasKeymapOptions {
  onEnterBelow: () => void
  onMergeUp: () => void
  onFocusPrev: () => void
  onFocusNext: () => void
}

export const CanvasKeymap = Extension.create<CanvasKeymapOptions>({
  name: 'canvasKeymap',

  addProseMirrorPlugins() {
    const { onEnterBelow, onMergeUp, onFocusPrev, onFocusNext } = this.options

    return [
      new Plugin({
        key: new PluginKey('canvasKeymap'),
        props: {
          handleKeyDown: (view, event) => {
            const { state } = view
            const { selection } = state
            const { $from, $to } = selection

            // Check if we're at document boundaries
            const atStart = $from.parentOffset === 0 && $from.depth === 1
            const atEnd = $from.parentOffset === $from.parent.content.size && $from.depth === 1

            // Ignore during IME composition
            if ((view as any).composing) {
              return false
            }

            // Enter at end → create block below
            if (event.key === 'Enter' && !event.shiftKey && atEnd) {
              event.preventDefault()
              onEnterBelow()
              return true
            }

            // Backspace at start → merge with previous block
            if (event.key === 'Backspace' && atStart && $from.sameParent($to)) {
              event.preventDefault()
              onMergeUp()
              return true
            }

            // ArrowUp at start → focus previous block
            if (event.key === 'ArrowUp' && atStart) {
              event.preventDefault()
              onFocusPrev()
              return true
            }

            // ArrowDown at end → focus next block
            if (event.key === 'ArrowDown' && atEnd) {
              event.preventDefault()
              onFocusNext()
              return true
            }

            // Tab handling: let TipTap handle for lists, otherwise navigate
            if (event.key === 'Tab') {
              const isInList = state.doc.resolve($from.pos).parent.type.name === 'listItem'
              if (!isInList) {
                event.preventDefault()
                if (event.shiftKey) {
                  onFocusPrev()
                } else {
                  onFocusNext()
                }
                return true
              }
            }

            return false
          },
        },
      }),
    ]
  },
})
```

### 5. Create TipTapEditor Component (`src/renderers/TipTapEditor.tsx`)

```typescript
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import { CanvasKeymap } from '../extensions/CanvasKeymap'
import { sanitizeAndSave } from '../utils/sanitizeHTML'
import { useEffect } from 'react'

interface TipTapEditorProps {
  content: string
  onChange: (html: string) => void
  onEnterBelow?: () => void
  onMergeUp?: () => void
  onFocusPrev?: () => void
  onFocusNext?: () => void
  placeholder?: string
  autoFocus?: boolean
}

export default function TipTapEditor({
  content,
  onChange,
  onEnterBelow = () => {},
  onMergeUp = () => {},
  onFocusPrev = () => {},
  onFocusNext = () => {},
  placeholder = "Type '/' for commands",
  autoFocus = false,
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Highlight,
      Placeholder.configure({
        placeholder,
      }),
      CanvasKeymap.configure({
        onEnterBelow,
        onMergeUp,
        onFocusPrev,
        onFocusNext,
      }),
    ],
    content,
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const sanitized = sanitizeAndSave(html)
      onChange(sanitized)
    },
  })

  // Update content when prop changes (for external updates)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false)
    }
  }, [content, editor])

  if (!editor) {
    return <div>Loading editor...</div>
  }

  return (
    <div className="tiptap-editor-wrapper">
      <EditorContent editor={editor} />
    </div>
  )
}
```

### 6. Add Editor Count Telemetry (`src/utils/editorTelemetry.ts`)

```typescript
let activeEditorCount = 0

export function incrementEditorCount() {
  activeEditorCount++
  if (process.env.NODE_ENV === 'development') {
    console.log(`📝 Active editors: ${activeEditorCount}`)
  }
}

export function decrementEditorCount() {
  activeEditorCount--
  if (process.env.NODE_ENV === 'development') {
    console.log(`📝 Active editors: ${activeEditorCount}`)
  }
}

export function getActiveEditorCount() {
  return activeEditorCount
}
```

### 7. Update BlockData Type (`src/types.ts`)

```typescript
export type BlockData = {
  text: string // Stores HTML (rich text)
  stackId?: string
  height?: number
  insertionOrder?: number
  isBottomNode?: boolean
  cachedHTML?: string // Pre-rendered for view mode (Phase 1 nice-to-have)

  // ... existing callbacks
}
```

### 8. Update NotionBlock Component

**Key changes:**
- Replace `<textarea>` with TipTapEditor
- Add drag-vs-edit guard (disable drag when focused)
- Keep ResizeObserver for height tracking
- Wire up keyboard callbacks to CanvasKeymap
- Increment/decrement telemetry on mount/unmount

```typescript
// Pseudo-code for NotionBlock changes
import TipTapEditor from './TipTapEditor'
import { incrementEditorCount, decrementEditorCount } from '../utils/editorTelemetry'

// In component:
useEffect(() => {
  incrementEditorCount()
  return () => decrementEditorCount()
}, [])

// Disable dragging while focused
const [isFocused, setIsFocused] = useState(false)

// Replace textarea with:
<TipTapEditor
  content={data.text}
  onChange={(html) => {
    if (data.onChange) {
      data.onChange(html)
    }
  }}
  onEnterBelow={data.onAdd}
  onMergeUp={data.onMergeUp}
  onFocusPrev={() => data.onTabPrev?.(id)}
  onFocusNext={() => data.onTabNext?.(id)}
  placeholder={data.placeholder}
/>
```

### 9. Update FullscreenModal

- Get all blocks in stack (filter by `stackId`, sort by `insertionOrder`)
- Pass `stackId` and nodes to modal
- Render each block with TipTapEditor
- Keep same callbacks (they update ReactFlow state)

### 10. Add Basic Styling (`src/styles/tiptap.css`)

```css
/* TipTap editor wrapper */
.tiptap-editor-wrapper {
  width: 100%;
}

/* ProseMirror editor styles */
.ProseMirror {
  outline: none;
  min-height: 24px;
  padding: 4px 0;
}

/* Placeholder */
.ProseMirror p.is-editor-empty:first-child::before {
  color: #adb5bd;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

/* Headings */
.ProseMirror h1 {
  font-size: 2em;
  font-weight: 700;
  margin: 0.5em 0;
}

.ProseMirror h2 {
  font-size: 1.5em;
  font-weight: 700;
  margin: 0.5em 0;
}

.ProseMirror h3 {
  font-size: 1.25em;
  font-weight: 700;
  margin: 0.5em 0;
}

/* Lists */
.ProseMirror ul,
.ProseMirror ol {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

/* Blockquote */
.ProseMirror blockquote {
  border-left: 3px solid #dee2e6;
  padding-left: 1em;
  font-style: italic;
  color: #495057;
  margin: 0.5em 0;
}

/* Marks */
.ProseMirror mark {
  background-color: #fff3bf;
  padding: 0 2px;
}

.ProseMirror code {
  background-color: #f1f3f5;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
}
```

### 11. Phase 1 Sanity Checklist

Before shipping Phase 1, verify:

- [ ] All blocks have stable `id` (uuid)
- [ ] HTML is sanitized on every save/paste (DOMPurify)
- [ ] List semantics decided (Option A or B)
- [ ] Enter at end → creates block below
- [ ] Backspace at start → merges with previous block
- [ ] ArrowUp/Down at boundaries → navigates between blocks
- [ ] Tab/Shift+Tab navigates between blocks (except inside lists)
- [ ] IME composition is handled (no navigation during typing)
- [ ] Dragging is disabled while editor is focused
- [ ] Editor count telemetry logs in dev console
- [ ] Tested with 20-30 blocks on desktop
- [ ] Tested on iOS Safari (IME, toolbar, scroll)
- [ ] Tested on Android Chrome (IME, keyboard)
- [ ] ResizeObserver still works for height tracking
- [ ] FullscreenModal renders all stack blocks correctly

---

## Phase 2: Production Optimizations

**Goal:** Scale to 200+ blocks with snappy performance and robust architecture.

### Architecture Improvements

#### 1. Editor Pooling (`src/hooks/useEditorPool.ts`)

**Concept:** Maintain a pool of 6-12 reusable TipTap editor instances. Attach/detach as blocks come into focus.

```typescript
// Pseudo-code structure
interface EditorPoolInstance {
  id: string
  editor: Editor | null
  inUse: boolean
  attachedToBlock: string | null
}

export function useEditorPool(poolSize = 10) {
  const pool = useRef<EditorPoolInstance[]>([])

  const attachEditor = (blockId: string, content: string, callbacks: any) => {
    // Find free instance in pool
    // Initialize if needed
    // Attach to block
    // Return editor instance
  }

  const detachEditor = (blockId: string) => {
    // Serialize content
    // Mark instance as free
    // Keep in pool for reuse
  }

  const getActiveCount = () => {
    return pool.current.filter(i => i.inUse).length
  }

  return { attachEditor, detachEditor, getActiveCount }
}
```

**Benefits:**
- Never exceed pool size (e.g., 10 active editors max)
- Reuse instances as focus moves
- Dramatically reduces memory footprint

#### 2. Store JSON, Not HTML

**Update BlockData:**

```typescript
export type BlockData = {
  content: JSONContent // TipTap JSON (source of truth)
  cachedHTML: string // Pre-rendered for view mode
  stackId?: string
  height?: number
  insertionOrder?: number
  isBottomNode?: boolean

  // ... callbacks
}
```

**Benefits:**
- Lossless round-trip
- Easier diffing
- Faster to parse
- Better for collaboration/CRDT later

**Migration path:**
```typescript
// Convert existing HTML to JSON on load
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'

const json = generateJSON(htmlContent, [StarterKit, Underline, Highlight])
```

#### 3. Viewport-Aware Mounting (IntersectionObserver)

**Concept:** Only mount editors for visible blocks + ±1 around focus. Off-screen blocks render cached HTML only.

```typescript
// In NotionBlock component
const [isVisible, setIsVisible] = useState(false)
const blockRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => {
      setIsVisible(entry.isIntersecting)
    },
    {
      rootMargin: '100px', // Pre-load slightly off-screen
      threshold: 0.1
    }
  )

  if (blockRef.current) {
    observer.observe(blockRef.current)
  }

  return () => observer.disconnect()
}, [])

// Render logic:
// if (isVisible && shouldHaveEditor) {
//   <TipTapEditor ... />
// } else {
//   <div dangerouslySetInnerHTML={{ __html: data.cachedHTML }} />
// }
```

**Benefits:**
- Scales to 1000+ blocks
- Only renders what you see
- Cap: never exceed pool size

#### 4. Debounced Persistence

**Concept:** Buffer onChange with 200-300ms debounce. Batch writes per animation frame. Autosave snapshots every 10s.

```typescript
// In TipTapEditor or parent
const debouncedSave = useMemo(
  () => debounce((content: JSONContent) => {
    // Save to state
    onChange(content)
  }, 250),
  [onChange]
)

// Autosave timer
useEffect(() => {
  const interval = setInterval(() => {
    // Snapshot all active blocks
    saveSnapshot()
  }, 10000) // 10 seconds

  return () => clearInterval(interval)
}, [])
```

#### 5. Drag-vs-Edit Guards

**Concept:** When editor is focused, disable card dragging. Only allow drag from handle.

```typescript
// In NotionBlock
const [isEditorFocused, setIsEditorFocused] = useState(false)

// Pass to ReactFlow
<Node
  draggable={!isEditorFocused}
  dragHandle={isEditorFocused ? '.drag-handle' : undefined}
  ...
/>

// Stop pointer event propagation from editor
<div
  onPointerDown={(e) => e.stopPropagation()}
  onTouchStart={(e) => e.stopPropagation()}
>
  <TipTapEditor ... />
</div>
```

#### 6. Smart Activation

**Concept:** Click any block in stack → activate stack. But only attach editors for visible blocks. Pre-warm on hover.

```typescript
// Stack activation state (in useStackEditor)
const [activeStackId, setActiveStackId] = useState<string | null>(null)

// Pre-warm on hover
const handleBlockHover = (blockId: string, stackId?: string) => {
  if (stackId && stackId !== activeStackId) {
    // Schedule pool attach (low priority)
    setTimeout(() => {
      preWarmStack(stackId)
    }, 200)
  }
}

// Fast deactivation
const deactivateStack = () => {
  // Serialize all active editors
  // Return instances to pool
  // Swap to cached HTML
  setActiveStackId(null)
}
```

#### 7. Paste & Split Handler

**Concept:** Multi-paragraph paste creates multiple blocks. Sanitize on paste.

```typescript
// In TipTapEditor or parent
const handlePaste = (view: EditorView, event: ClipboardEvent) => {
  const html = event.clipboardData?.getData('text/html')
  if (!html) return false

  // Parse HTML to detect multiple top-level nodes
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const topLevelNodes = Array.from(doc.body.children)

  if (topLevelNodes.length > 1) {
    event.preventDefault()

    // Create first block content
    const firstContent = topLevelNodes[0].outerHTML
    view.dispatch(/* insert first content */)

    // Create new blocks for remaining content
    topLevelNodes.slice(1).forEach((node, idx) => {
      createBlockBelow(currentBlockId, node.outerHTML)
    })

    return true
  }

  return false // Let TipTap handle
}
```

#### 8. Caret Memory

**Concept:** Store caret position on blur, restore on focus.

```typescript
// Global or context state
const caretMemory = useRef<Map<string, number>>(new Map())

// On blur
const handleBlur = (blockId: string, editor: Editor) => {
  const pos = editor.state.selection.from
  caretMemory.current.set(blockId, pos)
}

// On focus
const handleFocus = (blockId: string, editor: Editor) => {
  const savedPos = caretMemory.current.get(blockId)
  if (savedPos !== undefined) {
    editor.commands.setTextSelection(savedPos)
  }
}
```

#### 9. Performance Monitoring

```typescript
// In dev mode
if (process.env.NODE_ENV === 'development') {
  const activeCount = editorPool.getActiveCount()
  if (activeCount > POOL_SIZE) {
    console.warn(`⚠️ Editor pool exceeded: ${activeCount}/${POOL_SIZE}`)
  }

  // Memory audit
  if (performance.memory) {
    console.log('Memory:', {
      used: performance.memory.usedJSHeapSize / 1048576,
      total: performance.memory.totalJSHeapSize / 1048576,
    })
  }
}
```

### Phase 2 Implementation Steps

1. Create `useEditorPool` hook
2. Update `BlockData` to store JSON + cachedHTML
3. Add IntersectionObserver to NotionBlock
4. Create unified CanvasKeymap extension (if not already in Phase 1)
5. Wire pooling to NotionBlock
6. Add debounced persistence
7. Implement drag guards
8. Add paste splitter
9. Add caret memory
10. Add performance monitoring
11. Test with 200+ blocks
12. Memory profiling and optimization
13. Mobile testing (iOS, Android)

---

## Warnings & Pitfalls

### 1. HTML as Source of Truth (Phase 1)

**Problem:** HTML is lossy and harder to diff.

**Mitigation:**
- Sanitize aggressively (DOMPurify)
- Normalize tags consistently
- Plan migration to JSON in Phase 2
- Don't delay JSON migration too long

### 2. Paste Explosions

**Problem:** Pasting multi-paragraph content into one block creates monster blocks.

**Mitigation:**
- Add paste splitter in Phase 1 (even basic version)
- Detect multiple top-level nodes
- Create separate blocks

### 3. History Memory

**Problem:** StarterKit's History runs per editor. With many editors, memory grows.

**Mitigation:**
- Phase 1: Accept it (20-30 editors is fine)
- Phase 2: Limit history depth
- Phase 2: Editor pooling reduces active editors

### 4. Tab Conflicts

**Problem:** TipTap wants Tab for list indent. You want Tab for navigation.

**Mitigation:**
- In CanvasKeymap: only intercept Tab outside of lists
- Check `isInList` before preventing default
- Let TipTap handle Tab inside lists

### 5. IME Composition

**Problem:** Arrow keys during IME composition break input.

**Mitigation:**
- Check `view.composing` in keymap
- Skip boundary logic during composition
- See CanvasKeymap example above

### 6. Mobile Keyboards

**Problem:** iOS toolbar, Android IME, scroll bounce while typing.

**Mitigation:**
- Test early and often
- Use `viewport-fit=cover` meta tag
- Handle keyboard show/hide events
- Test on real devices (not just simulators)

### 7. ReactFlow Drag Conflicts

**Problem:** Clicking editor triggers card drag.

**Mitigation:**
- Stop pointer event propagation from editor
- Disable dragging while focused
- Use drag handle only

---

## Testing Strategy

### Phase 1 Testing

**Functional:**
- [ ] Create block (Enter at end)
- [ ] Delete block (Backspace at start + empty)
- [ ] Merge blocks (Backspace at start)
- [ ] Navigate with Tab/Shift+Tab
- [ ] Navigate with Arrow Up/Down
- [ ] Bold, italic, underline, highlight
- [ ] Headings (h1, h2, h3)
- [ ] Lists (bullet, ordered)
- [ ] Blockquote
- [ ] Paste plain text
- [ ] Paste rich text (multi-paragraph)
- [ ] Undo/redo within block
- [ ] FullscreenModal shows all blocks
- [ ] Dragging disabled while editing

**Performance:**
- [ ] 20 blocks (should be smooth)
- [ ] 30 blocks (acceptable)
- [ ] Measure: time to create 20 blocks
- [ ] Measure: time to navigate 20 blocks with Tab
- [ ] Check: editor count telemetry

**Mobile:**
- [ ] iOS Safari: typing, IME, toolbar
- [ ] Android Chrome: typing, IME, keyboard
- [ ] Touch: tap to focus, tap to drag
- [ ] Scroll: no bounce while typing

### Phase 2 Testing

**Performance:**
- [ ] 100 blocks (smooth)
- [ ] 200 blocks (smooth)
- [ ] 500 blocks (acceptable)
- [ ] Memory profiling (no leaks)
- [ ] Pool never exceeded
- [ ] Viewport mounting works

**Functional:**
- [ ] All Phase 1 tests pass
- [ ] Caret memory works (blur → focus)
- [ ] Hover pre-warm works
- [ ] Stack activation/deactivation works
- [ ] Multi-block paste creates separate blocks
- [ ] JSON round-trip lossless

---

## Migration Path (Phase 1 → Phase 2)

### 1. HTML to JSON Migration

When upgrading to Phase 2:

```typescript
import { generateJSON } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'

// Run once on app load
function migrateBlocksToJSON(blocks: BlockData[]) {
  return blocks.map(block => {
    if (block.content) {
      // Already migrated
      return block
    }

    // Convert HTML to JSON
    const json = generateJSON(block.text, [
      StarterKit,
      Underline,
      Highlight,
    ])

    return {
      ...block,
      content: json,
      cachedHTML: block.text,
    }
  })
}
```

### 2. Gradual Rollout

- Keep HTML as fallback during migration
- Dual-write: save both JSON and HTML
- After 1-2 weeks, drop HTML storage
- Only keep cachedHTML for view mode

---

## Code Examples

### Minimal Paste Splitter

```typescript
function splitPastedContent(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const topLevelNodes = Array.from(doc.body.children)

  if (topLevelNodes.length <= 1) {
    return [html]
  }

  return topLevelNodes.map(node => node.outerHTML)
}

// Usage in paste handler
const pastedHTML = event.clipboardData?.getData('text/html') || ''
const blocks = splitPastedContent(pastedHTML)

if (blocks.length > 1) {
  event.preventDefault()

  // Insert first block in current editor
  editor.commands.setContent(blocks[0])

  // Create new blocks for rest
  blocks.slice(1).forEach(html => {
    createBlockBelow(currentBlockId, html)
  })
}
```

### Drag Handle Guard

```typescript
// In NotionBlock
const [isDraggable, setIsDraggable] = useState(true)

return (
  <div
    data-draggable={isDraggable}
    onPointerDown={(e) => {
      // Only allow drag from handle
      const target = e.target as HTMLElement
      if (!target.closest('.drag-handle')) {
        e.stopPropagation()
      }
    }}
  >
    <button className="drag-handle">⋮⋮</button>
    <TipTapEditor
      onFocus={() => setIsDraggable(false)}
      onBlur={() => setIsDraggable(true)}
      ...
    />
  </div>
)
```

---

## Summary

### Phase 1 Deliverables
- TipTap in every NotionBlock
- HTML storage with sanitization
- Keyboard navigation (Enter, Backspace, Tab, Arrow)
- Basic slash menu
- Drag guards
- Telemetry
- Mobile tested
- Works well with 20-30 blocks

### Phase 2 Deliverables
- Editor pooling (6-12 max)
- JSON storage + cached HTML
- Viewport-aware mounting
- Debounced persistence
- Stack activation
- Paste splitter
- Caret memory
- Performance monitoring
- Scales to 200+ blocks (1000+ with good UX)

### Timeline
- **Phase 1:** 2-3 days (MVP)
- **Phase 2:** 1-2 weeks (production-ready)

---

## Questions & Decisions Log

### Q: Should we implement slash menu in Phase 1?
**A:** Yes, basic version. Users expect `/` commands for headings and lists. Keep it simple (no fancy search).

### Q: List semantics - A or B?
**A:** **Option A** (one block = whole list) for Phase 1. Easier to implement, better performance. Can migrate to Option B later if needed.

### Q: Should we use `contenteditable` instead of TipTap?
**A:** No. Custom contenteditable is hard (selection, undo/redo, marks). TipTap handles all edge cases. Pooling solves performance.

### Q: When to migrate to JSON storage?
**A:** Start of Phase 2. HTML is fine for MVP, but JSON is needed for scale and collaboration features.

### Q: Should we support images in Phase 1?
**A:** No. Focus on text first. Images add complexity (upload, storage, rendering). Add in Phase 2 or Phase 3.

---

## Resources

- [TipTap Documentation](https://tiptap.dev/)
- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)
- [Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)

---

## Version History

- **v1.0** (2025-10-12): Initial plan with Phase 1 and Phase 2 details
