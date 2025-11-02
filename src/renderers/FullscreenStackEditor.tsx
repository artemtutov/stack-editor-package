import React, { useCallback, useEffect, useMemo } from 'react'
import { useEditor, EditorContent, EditorContext } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import type { RichTextPayload } from '../types'
import { createEditorExtensions } from '../editor/extensions'
import { ensureJsonContent, jsonToHtml, createEmptyPayload } from '../editor/richText'
import { sanitizeAndSave } from '../utils/sanitizeHTML'
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '../components/tiptap-ui-primitive/toolbar'
import { Spacer } from '../components/tiptap-ui-primitive/spacer'
import { Button } from '../components/tiptap-ui-primitive/button'
import { UndoRedoButton } from '../components/tiptap-ui/undo-redo-button'
import { HeadingButton } from '../components/tiptap-ui/heading-button'
import { ListButton } from '../components/tiptap-ui/list-button'
import { BlockquoteButton } from '../components/tiptap-ui/blockquote-button'
import { CodeBlockButton } from '../components/tiptap-ui/code-block-button'
import { MarkButton } from '../components/tiptap-ui/mark-button'
import { TextAlignButton } from '../components/tiptap-ui/text-align-button'
import { LinkPopover } from '../components/tiptap-ui/link-popover'
import { ColorHighlightButton } from '../components/tiptap-ui/color-highlight-button'
import { MenuIcon } from '../components/tiptap-icons/menu-icon'
import { MinusIcon } from '../components/tiptap-icons/minus-icon'
import { useIsMobile } from '../hooks/use-mobile'
import '../styles/fullscreen-editor.scss'
import { normalizeFullscreenPaste } from '../utils/pasteFullscreen'

type FullscreenStackEditorProps = {
  isOpen: boolean
  blocks: Array<{ id: string; content: RichTextPayload }>
  onCancel: () => void
  onSave: (blocks: Array<{ id?: string; content: RichTextPayload }>) => void
  onToggleSidebar?: () => void
  isSidebarOpen?: boolean
}

const FALLBACK_DOC: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [],
    },
  ],
}

export default function FullscreenStackEditor({ isOpen, blocks, onCancel, onSave, onToggleSidebar, isSidebarOpen }: FullscreenStackEditorProps) {
  const isMobile = useIsMobile(480)
  const { doc } = useMemo(() => blocksToDoc(blocks), [blocks])
  const extensions = useMemo(() => createEditorExtensions({
    placeholder: "Type '/' for commands",
    includeSlashMenu: true,
    includeTrailingNode: true,  // Fullscreen editor needs trailing node for adding blocks
    includeTasks: true  // Enable to-do list checkboxes
  }), [])

  const editor = useEditor({
    extensions,
    content: doc,
    autofocus: 'end',
    editorProps: {
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData('text/html')
        if (!html) return false
        const sanitized = normalizeFullscreenPaste(html)
        event.preventDefault()
        // Let Tiptap parse the sanitized HTML with our extensions
        editor?.commands.insertContent(sanitized)
        return true
      },
    },
  })

  useEffect(() => {
    if (!editor || !isOpen) return

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Fullscreen] Opening editor with blocks:', blocks.map(b => ({ id: b.id, type: ensureJsonContent(b.content.json).content?.[0]?.type })))
    }

    const next = blocksToDoc(blocks).doc

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Fullscreen] About to setContent with doc:', JSON.stringify(next, null, 2))
    }

    editor.commands.setContent(next, { emitUpdate: false })

    // Fresh history session on open (no cross-session undo)
    if (process.env.NODE_ENV !== 'production') {
      try {
        const tops = ensureJsonContent(next).content || []
        const missing = tops.filter((n: any) => !(n.attrs && n.attrs.blockId))
        if (missing.length) {
          // eslint-disable-next-line no-console
          console.warn('[Fullscreen] Some top-level nodes are missing blockId:', missing.map((n: any) => n.type))
        }

        // Check what actually made it into the editor
        setTimeout(() => {
          const editorDoc = editor.getJSON()
          console.log('[Fullscreen] Editor doc after setContent:', JSON.stringify(editorDoc, null, 2))
        }, 100)
      } catch {}
    }
  }, [editor, blocks, isOpen])

  const handleSave = useCallback(() => {
    if (!editor) return
    const json = editor.getJSON()
    const results = docToBlocks(json)
    if (process.env.NODE_ENV !== 'production') {
      try {
        const prevIds = new Set((blocks || []).map((b) => b.id))
        const outIds = new Set(results.map((r) => r.id).filter(Boolean) as string[])
        const newIds = [...results.map((r) => r.id).filter((id): id is string => !!id && !prevIds.has(id))]
        const deleted = [...[...prevIds].filter((id) => !outIds.has(id))]
        const tops = ensureJsonContent(json).content || []
        const expectedCount = (prevIds.size + newIds.length - deleted.length)
        if (tops.length !== expectedCount) {
          // eslint-disable-next-line no-console
          console.warn('[Fullscreen] Top-level count mismatch on save', { tops: tops.length, expectedCount })
        }
      } catch {}
    }
    onSave(results)
    // Note: If you want a hard history reset, recreate the editor instance.
  }, [editor, onSave])

  if (!isOpen) return null

  // Editing tools component (shared between desktop and mobile) - matches TextNode order
  const EditingTools = () => (
    <>
      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <HeadingButton level={1} />
        <HeadingButton level={2} />
        <HeadingButton level={3} />
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <ListButton type="bulletList" />
        <ListButton type="orderedList" />
        <ListButton type="taskList" />
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="underline" />
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <MarkButton type="code" />
        <CodeBlockButton />
        <ColorHighlightButton highlightColor="var(--tt-color-highlight-yellow)" />
        <LinkPopover />
        <BlockquoteButton />
        <Button
          type="button"
          data-style="ghost"
          aria-label="Horizontal Rule"
          tooltip="Horizontal Rule"
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          <MinusIcon className="tiptap-button-icon" />
        </Button>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>
    </>
  )

  // Action buttons (Cancel/Save)
  const ActionButtons = () => (
    <ToolbarGroup>
      {onCancel && (
        <Button type="button" data-style="ghost" aria-label="Cancel editing" onClick={onCancel}>
          Cancel
        </Button>
      )}
      <Button type="button" aria-label="Save changes" onClick={handleSave}>
        Save
      </Button>
    </ToolbarGroup>
  )

  return (
    <div className="tt-shell">
      <EditorContext.Provider value={{ editor }}>
        {isMobile ? (
          // Mobile layout: Top bar (Menu + Actions) + Bottom bar (Editing tools)
          <>
            <Toolbar variant="fixed" className="tt-toolbar tt-toolbar-top" aria-label="Fullscreen editor top toolbar" data-toolbar-position="top">
              <ToolbarGroup>
                <Button type="button" data-style="ghost" aria-label="Menu" onClick={onToggleSidebar}>
                  <MenuIcon className="tiptap-button-icon" />
                </Button>
              </ToolbarGroup>
              <Spacer />
              <ActionButtons />
            </Toolbar>

            <div className="tt-content">
              <EditorContent editor={editor!} className="tiptap" />
            </div>

            <Toolbar variant="fixed" className="tt-toolbar tt-toolbar-bottom" aria-label="Fullscreen editor editing toolbar" data-toolbar-position="bottom">
              <EditingTools />
            </Toolbar>
          </>
        ) : (
          // Desktop layout: Three-part top bar (Menu + Centered editing tools + Done)
          <>
            <Toolbar variant="fixed" className="tt-toolbar" aria-label="Fullscreen editor toolbar">
              <ToolbarGroup>
                <Button type="button" data-style="ghost" aria-label="Menu" onClick={onToggleSidebar}>
                  <MenuIcon className="tiptap-button-icon" />
                </Button>
              </ToolbarGroup>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <EditingTools />
              </div>
              <ToolbarGroup>
                <Button type="button" aria-label="Save changes" onClick={handleSave}>
                  Done
                </Button>
              </ToolbarGroup>
            </Toolbar>

            <div className="tt-content">
              <EditorContent editor={editor!} className="tiptap" />
            </div>
          </>
        )}
      </EditorContext.Provider>
    </div>
  )
}

export function blocksToDoc(blocks: Array<{ id: string; content: RichTextPayload }>): { doc: JSONContent } {
  const content = blocks.map(({ id, content }) => {
    const json = ensureJsonContent(content.json)
    const top = (json.content && json.content[0]) || { type: 'paragraph', content: [] }
    const attrs = { ...(top as any).attrs, blockId: id }
    const result = { ...top, attrs }
    console.log('[blocksToDoc] Mapping block:', { id, nodeType: top.type, hasBlockId: !!attrs.blockId })
    return result
  })
  console.log('[blocksToDoc] Final doc:', JSON.stringify({ type: 'doc', content }, null, 2))
  return { doc: content.length ? { type: 'doc', content } : FALLBACK_DOC }
}

function stripBlockId(json: JSONContent): JSONContent {
  const j = ensureJsonContent(json)
  if (!j.content || j.content.length === 0) return j

  let content = [...(j.content as any[])]

  // Remove trailing empty paragraph (from TrailingNode or TipTap's default behavior)
  // Keep removing while the last node is an empty paragraph
  while (content.length > 1) {
    const lastNode = content[content.length - 1]
    if (lastNode?.type === 'paragraph' && (!lastNode.content || lastNode.content.length === 0)) {
      content = content.slice(0, -1)
    } else {
      break
    }
  }

  const top = { ...content[0] }
  if (top.attrs && 'blockId' in top.attrs) {
    const { blockId, ...rest } = top.attrs
    top.attrs = Object.keys(rest).length ? rest : undefined
  }
  return { type: 'doc', content: [top] }
}

export function docToBlocks(doc: JSONContent): Array<{ id?: string; content: RichTextPayload }> {
  const nodes = ensureJsonContent(doc).content ?? []
  if (nodes.length === 0) return [{ content: createEmptyPayload() }]

  console.log('[docToBlocks] Processing nodes:', JSON.stringify(nodes, null, 2))

  const results = nodes
    .map((node: any, index: number) => {
      console.log(`[docToBlocks] Node ${index}:`, {
        type: node.type,
        attrs: node.attrs,
        hasContent: !!node.content,
        contentLength: node.content?.length
      })

      const id = node?.attrs?.blockId as string | undefined

      // Filter out empty nodes without blockIds (TipTap placeholders)
      if (!id && (!node.content || node.content.length === 0)) {
        console.log(`[docToBlocks] Skipping empty node ${index} without blockId`)
        return null
      }

      const raw: JSONContent = { type: 'doc', content: [node] }
      const json = stripBlockId(raw)

      console.log(`[docToBlocks] After stripBlockId for node ${index}:`, JSON.stringify(json, null, 2))

      const html = sanitizeAndSave(jsonToHtml(json))
      console.log(`[docToBlocks] Generated HTML for node ${index}:`, html)

      return { id, content: { json, html } }
    })
    .filter((block): block is NonNullable<typeof block> => block !== null)

  // If all nodes were filtered out, return empty payload
  return results.length > 0 ? results : [{ content: createEmptyPayload() }]
}
