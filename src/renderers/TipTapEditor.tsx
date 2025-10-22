import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import type { BlockData, RichTextPayload, SlashPayload } from '../types'
import { CanvasKeymap } from '../extensions/CanvasKeymap'
import { splitPastedContent } from '../utils/paste'
import { incrementEditorCount, decrementEditorCount } from '../utils/editorTelemetry'
import { createEditorExtensions } from '../editor/extensions'
import { htmlToJson, jsonToHtml, ensureJsonContent, cleanTrailingParagraphs } from '../editor/richText'
import { sanitizeAndSave } from '../utils/sanitizeHTML'

// Helper: Find slash range and query for slash menu
function findSlashRange(state: Editor['state']) {
  const { from } = state.selection
  const textBefore = state.doc.textBetween(Math.max(0, from - 200), from, '\n', '\n')
  const idx = textBefore.lastIndexOf('/')
  if (idx === -1) return null

  // Don't trigger if slash is inside a word (e.g., "https://")
  const prev = textBefore[idx - 1]
  if (prev && /\S/.test(prev)) return null

  const query = textBefore.slice(idx + 1)
  const slashFrom = from - query.length - 1
  const slashTo = from

  return { from: slashFrom, to: slashTo, query }
}

export type TipTapEditorProps = {
  blockId: string
  contentJson: JSONContent
  placeholder?: string
  autoFocus?: boolean
  onContentUpdate: (payload: RichTextPayload) => void
  onContentCommit?: () => void  // Called when editing completes (e.g., on blur)
  createBlockBelow: (initialContent?: RichTextPayload) => void
  createMultipleBlocksBelow?: (payloads: RichTextPayload[]) => void
  mergeBlockUp: (currentContent?: RichTextPayload) => void
  focusPrevious: () => void
  focusNext: () => void
  focusPreviousTab: () => void
  focusNextTab: () => void
  deleteBlock: () => void
  triggerSlashCommand: (payload: SlashPayload) => void
  focusRef?: BlockData['focusRef']
  onFocusChange?: (focused: boolean) => void
}

export default function TipTapEditor({
  blockId,
  contentJson,
  placeholder = "Type '/' for commands",
  autoFocus = false,
  onContentUpdate,
  onContentCommit,
  createBlockBelow,
  createMultipleBlocksBelow,
  mergeBlockUp,
  focusPrevious,
  focusNext,
  focusPreviousTab,
  focusNextTab,
  deleteBlock,
  triggerSlashCommand,
  focusRef,
  onFocusChange,
}: TipTapEditorProps) {
  const editorRef = useRef<Editor | null>(null)
  const lastKnownJsonRef = useRef<JSONContent>(contentJson)
  const commitTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Listen for history:restoring to clear pending auto-commit timer
  useEffect(() => {
    const handleHistoryRestoring = () => {
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current)
        commitTimeoutRef.current = null
      }
    }

    window.addEventListener('history:restoring', handleHistoryRestoring)
    return () => window.removeEventListener('history:restoring', handleHistoryRestoring)
  }, [])

  const baseExtensions = useMemo(() => createEditorExtensions({
    placeholder,
    includeSlashMenu: false,
    singleBlock: true,  // Individual block editors use single-block schema (prevents trailing paragraphs)
    includeTasks: true  // Enable to-do list checkboxes in canvas blocks
  }), [placeholder])

  const extensions = useMemo(
    () => [
      ...baseExtensions,
      CanvasKeymap.configure({
        onEnterBelow: (content) => createBlockBelow(content),
        onMergeUp: (currentContent) => mergeBlockUp(currentContent),
        onFocusPrev: focusPrevious,
        onFocusNext: focusNext,
        onTabPrev: focusPreviousTab,
        onTabNext: focusNextTab,
        onDeleteBlock: deleteBlock,
      }),
    ],
    [baseExtensions, createBlockBelow, mergeBlockUp, focusPrevious, focusNext, focusPreviousTab, focusNextTab, deleteBlock]
  )

  const editor = useEditor({
    extensions,
    content: cleanTrailingParagraphs(ensureJsonContent(contentJson)),
    autofocus: autoFocus ? 'end' : false,
    onCreate: ({ editor }) => {
      editorRef.current = editor
      incrementEditorCount()
    },
    onDestroy: () => {
      editorRef.current = null
      decrementEditorCount()

      // Clean up auto-commit timer
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current)
      }
    },
    onUpdate: ({ editor }) => {
      const nextJson = ensureJsonContent(editor.getJSON())
      // Store latest JSON for merge operations (bypasses React state delays)
      lastKnownJsonRef.current = nextJson
      const nextHtml = sanitizeAndSave(jsonToHtml(nextJson))
      onContentUpdate({ json: nextJson, html: nextHtml })

      // Debounced auto-commit: create snapshot after 2 seconds of typing inactivity
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current)
      }
      commitTimeoutRef.current = setTimeout(() => {
        onContentCommit?.()  // Emits content.commit event for granular undo
      }, 2000)
    },
    editorProps: {
      attributes: {
        'data-placeholder': placeholder,
        spellcheck: 'true',
        role: 'textbox',
        'aria-label': 'Block content',
        id: `block-${blockId}`,
      },
      handleKeyDown: (view, event) => {
        // Ignore during IME composition
        if ((view as any).composing) return false

        if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          // Let TipTap insert the "/" first, then we'll detect it
          setTimeout(() => {
            if (!editor) return
            const range = findSlashRange(editor.state)
            if (!range) return

            const { from } = editor.state.selection
            const coords = view.coordsAtPos(from)

            triggerSlashCommand({
              anchor: { x: coords.left, y: coords.bottom },
              range,
              blockId,
              getEditor: () => editor,
            })
          }, 0)
        }
        return false
      },
      handleTextInput: (view, _from, _to, _text) => {
        // Ignore during IME composition
        if ((view as any).composing) return false

        // Check if we're typing after a slash
        setTimeout(() => {
          if (!editor) return
          const range = findSlashRange(editor.state)
          if (!range) return

          const { from } = editor.state.selection
          const coords = view.coordsAtPos(from)

          triggerSlashCommand({
            anchor: { x: coords.left, y: coords.bottom },
            range,
            blockId,
            getEditor: () => editor,
          })
        }, 0)

        return false
      },
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData('text/html') || ''
        if (!html) return false

        const blocks = splitPastedContent(html).map((entry) => {
          const json = htmlToJson(entry)
          const sanitized = sanitizeAndSave(jsonToHtml(json))
          return { json, html: sanitized }
        })

        if (blocks.length <= 1) {
          return false
        }

        if (!editor) {
          return false
        }

        event.preventDefault()

        const firstBlock = blocks[0]
        editor.chain().setContent(firstBlock.json, { emitUpdate: false }).focus('end').run()
        onContentUpdate(firstBlock)

        // Use batch creation if available, otherwise fall back to sequential creation
        const remainingBlocks = blocks.slice(1)
        if (createMultipleBlocksBelow) {
          createMultipleBlocksBelow(remainingBlocks)
        } else {
          remainingBlocks.forEach((payload) => {
            createBlockBelow(payload)
          })
        }

        return true
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const handleFocus = () => onFocusChange?.(true)
    const handleBlur = () => {
      onFocusChange?.(false)

      // Clear pending auto-commit timer
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current)
        commitTimeoutRef.current = null
      }

      // Immediate commit on blur
      onContentCommit?.()
    }

    editor.on('focus', handleFocus)
    editor.on('blur', handleBlur)

    return () => {
      editor.off('focus', handleFocus)
      editor.off('blur', handleBlur)
    }
  }, [editor, onFocusChange, onContentCommit])

  useEffect(() => {
    if (!editor) return
    const current = ensureJsonContent(editor.getJSON())
    const incoming = cleanTrailingParagraphs(ensureJsonContent(contentJson))
    if (JSON.stringify(current) !== JSON.stringify(incoming)) {
      console.log('[TIPTAP] Content changed externally - calling setContent')
      console.log('[TIPTAP] Current:', current)
      console.log('[TIPTAP] Incoming:', incoming)
      editor.commands.setContent(incoming, { emitUpdate: false })
      // Update ref when content changes externally
      lastKnownJsonRef.current = incoming
    }
  }, [editor, contentJson])

  useEffect(() => {
    if (!focusRef) return

    if (!editor) {
      focusRef.current = null
      return
    }

    focusRef.current = {
      focus: () => {
        editor.chain().focus().run()
      },
      setCaretToEnd: () => {
        editor.chain().focus('end').run()
      },
      setCaretAt: (pos: number) => {
        const clamped = Math.max(0, Math.min(pos, editor.state.doc.content.size))
        editor.chain().setTextSelection(clamped).focus().run()
      },
      getLatestJson: () => {
        // Return the most recent JSON from editor or ref
        // This bypasses React state synchronization issues
        return lastKnownJsonRef.current
      },
    }

    return () => {
      if (focusRef.current) {
        focusRef.current = null
      }
    }
  }, [editor, focusRef])

  if (!editor) {
    return <div className="tiptap-editor-wrapper" />
  }

  return (
    <div
      className="tiptap-editor-wrapper"
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <div className="tiptap">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
