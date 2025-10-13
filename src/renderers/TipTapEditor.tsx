import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import type { BlockData, RichTextPayload } from '../types'
import { CanvasKeymap } from '../extensions/CanvasKeymap'
import { splitPastedContent } from '../utils/paste'
import { incrementEditorCount, decrementEditorCount } from '../utils/editorTelemetry'
import { createEditorExtensions } from '../editor/extensions'
import { htmlToJson, jsonToHtml, ensureJsonContent, cleanTrailingParagraphs } from '../editor/richText'
import { sanitizeAndSave } from '../utils/sanitizeHTML'

export type TipTapEditorProps = {
  blockId: string
  contentJson: JSONContent
  placeholder?: string
  autoFocus?: boolean
  onContentUpdate: (payload: RichTextPayload) => void
  createBlockBelow: (initialContent?: RichTextPayload) => void
  mergeBlockUp: () => void
  focusPrevious: () => void
  focusNext: () => void
  focusPreviousTab: () => void
  focusNextTab: () => void
  deleteBlock: () => void
  triggerSlashCommand: () => void
  focusRef?: BlockData['focusRef']
  onFocusChange?: (focused: boolean) => void
}

export default function TipTapEditor({
  blockId,
  contentJson,
  placeholder = "Type '/' for commands",
  autoFocus = false,
  onContentUpdate,
  createBlockBelow,
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

  const baseExtensions = useMemo(() => createEditorExtensions({
    placeholder,
    includeSlashMenu: false,
    singleBlock: true  // Individual block editors use single-block schema (prevents trailing paragraphs)
  }), [placeholder])

  const extensions = useMemo(
    () => [
      ...baseExtensions,
      CanvasKeymap.configure({
        onEnterBelow: () => createBlockBelow(),
        onMergeUp: mergeBlockUp,
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
    },
    onUpdate: ({ editor }) => {
      const nextJson = ensureJsonContent(editor.getJSON())
      const nextHtml = sanitizeAndSave(jsonToHtml(nextJson))
      onContentUpdate({ json: nextJson, html: nextHtml })
    },
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        'data-placeholder': placeholder,
        spellcheck: 'true',
        role: 'textbox',
        'aria-label': 'Block content',
        id: `block-${blockId}`,
      },
      handleKeyDown: (_view, event) => {
        if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          triggerSlashCommand()
          return true
        }
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

        const editorInstance = editorRef.current
        if (!editorInstance) {
          return false
        }

        event.preventDefault()

        const firstBlock = blocks[0]
        editorInstance.chain().setContent(firstBlock.json, { emitUpdate: false }).focus('end').run()
        onContentUpdate(firstBlock)

        blocks.slice(1).forEach((payload) => {
          createBlockBelow(payload)
        })

        return true
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const handleFocus = () => onFocusChange?.(true)
    const handleBlur = () => onFocusChange?.(false)

    editor.on('focus', handleFocus)
    editor.on('blur', handleBlur)

    return () => {
      editor.off('focus', handleFocus)
      editor.off('blur', handleBlur)
    }
  }, [editor, onFocusChange])

  useEffect(() => {
    if (!editor) return
    const current = ensureJsonContent(editor.getJSON())
    const incoming = cleanTrailingParagraphs(ensureJsonContent(contentJson))
    if (JSON.stringify(current) !== JSON.stringify(incoming)) {
      editor.commands.setContent(incoming, { emitUpdate: false })
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
      <EditorContent editor={editor} />
    </div>
  )
}
