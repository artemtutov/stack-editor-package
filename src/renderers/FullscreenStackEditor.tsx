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
import { HeadingDropdownMenu } from '../components/tiptap-ui/heading-dropdown-menu'
import { ListDropdownMenu } from '../components/tiptap-ui/list-dropdown-menu'
import { BlockquoteButton } from '../components/tiptap-ui/blockquote-button'
import { MarkButton } from '../components/tiptap-ui/mark-button'
import { TextAlignButton } from '../components/tiptap-ui/text-align-button'
import { LinkPopover } from '../components/tiptap-ui/link-popover'
import { HighlighterIcon } from '../components/tiptap-icons/highlighter-icon'
import '../styles/fullscreen-editor.scss'

type FullscreenStackEditorProps = {
  isOpen: boolean
  blocks: Array<{ id: string; content: RichTextPayload }>
  onCancel: () => void
  onSave: (blocks: Array<{ id?: string; content: RichTextPayload }>) => void
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

export default function FullscreenStackEditor({ isOpen, blocks, onCancel, onSave }: FullscreenStackEditorProps) {
  const { doc } = useMemo(() => blocksToDoc(blocks), [blocks])
  const extensions = useMemo(() => createEditorExtensions({ placeholder: "Type '/' for commands", includeSlashMenu: true }), [])

  const editor = useEditor({
    extensions,
    content: doc,
    autofocus: 'end',
    editorProps: {},
  })

  useEffect(() => {
    if (!editor || !isOpen) return
    const next = blocksToDoc(blocks).doc
    editor.commands.setContent(next, { emitUpdate: false })
  }, [editor, blocks, isOpen])

  const handleSave = useCallback(() => {
    if (!editor) return
    const results = docToBlocks(editor.getJSON())
    onSave(results)
  }, [editor, onSave])

  if (!isOpen) return null

  return (
    <div className="tt-shell">
      <EditorContext.Provider value={{ editor }}>
        <Toolbar variant="fixed" className="tt-toolbar" aria-label="Fullscreen editor toolbar">
          <Spacer />
          <ToolbarGroup>
            <UndoRedoButton action="undo" />
            <UndoRedoButton action="redo" />
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            <HeadingDropdownMenu levels={[1, 2, 3]} />
            <ListDropdownMenu types={["bulletList", "orderedList"]} />
            <BlockquoteButton />
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            <MarkButton type="bold" />
            <MarkButton type="italic" />
            <MarkButton type="underline" />
            <Button
              type="button"
              data-style="ghost"
              aria-label="Highlight"
              tooltip="Highlight"
              onClick={() => editor?.chain().focus().toggleHighlight().run()}
            >
              <HighlighterIcon className="tiptap-button-icon" />
            </Button>
            <LinkPopover />
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            <TextAlignButton align="left" />
            <TextAlignButton align="center" />
            <TextAlignButton align="right" />
            <TextAlignButton align="justify" />
          </ToolbarGroup>
          <Spacer />
          <ToolbarSeparator />
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
          <Spacer />
        </Toolbar>

        <div className="tt-content">
          <EditorContent editor={editor!} className="tiptap" />
        </div>
      </EditorContext.Provider>
    </div>
  )
}

function buttonStyle(primary: boolean): React.CSSProperties {
  if (primary) {
    return {
      border: '1px solid #2563eb',
      background: '#2563eb',
      color: '#fff',
      padding: '6px 14px',
      borderRadius: '6px',
      fontSize: '14px',
      cursor: 'pointer',
    }
  }
  return {
    border: '1px solid #d1d5db',
    background: 'white',
    color: '#111827',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  }
}

function blocksToDoc(blocks: Array<{ id: string; content: RichTextPayload }>): { doc: JSONContent } {
  const content = blocks.map(({ id, content }) => {
    const json = ensureJsonContent(content.json)
    const top = (json.content && json.content[0]) || { type: 'paragraph', content: [] }
    const attrs = { ...(top as any).attrs, blockId: id }
    return { ...top, attrs }
  })
  return { doc: content.length ? { type: 'doc', content } : FALLBACK_DOC }
}

function stripBlockId(json: JSONContent): JSONContent {
  const j = ensureJsonContent(json)
  if (!j.content || j.content.length === 0) return j
  const top = { ...(j.content[0] as any) }
  if (top.attrs && 'blockId' in top.attrs) {
    const { blockId, ...rest } = top.attrs
    top.attrs = Object.keys(rest).length ? rest : undefined
  }
  return { type: 'doc', content: [top] }
}

function docToBlocks(doc: JSONContent): Array<{ id?: string; content: RichTextPayload }> {
  const nodes = ensureJsonContent(doc).content ?? []
  if (nodes.length === 0) return [{ content: createEmptyPayload() }]

  return nodes.map((node: any) => {
    const raw: JSONContent = { type: 'doc', content: [node] }
    const id = node?.attrs?.blockId as string | undefined
    const json = stripBlockId(raw)
    const html = sanitizeAndSave(jsonToHtml(json))
    return { id, content: { json, html } }
  })
}
