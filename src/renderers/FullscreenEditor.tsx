import * as React from 'react'
import { EditorContent, useEditor, EditorContext } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'

import { createEditorExtensions } from '../editor/extensions'
import { ensureJsonContent, jsonToHtml } from '../editor/richText'
import { sanitizeAndSave } from '../utils/sanitizeHTML'

// UI primitives
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '../components/tiptap-ui-primitive/toolbar'
import { Spacer } from '../components/tiptap-ui-primitive/spacer'
import { Button } from '../components/tiptap-ui-primitive/button'

// UI controls
import { UndoRedoButton } from '../components/tiptap-ui/undo-redo-button'
import { HeadingDropdownMenu } from '../components/tiptap-ui/heading-dropdown-menu'
import { ListDropdownMenu } from '../components/tiptap-ui/list-dropdown-menu'
import { BlockquoteButton } from '../components/tiptap-ui/blockquote-button'
import { MarkButton } from '../components/tiptap-ui/mark-button'
import { TextAlignButton } from '../components/tiptap-ui/text-align-button'
import { LinkPopover, LinkButton } from '../components/tiptap-ui/link-popover'
import { ThemeToggle } from '../components/ThemeToggle'

// Icons
import { HighlighterIcon } from '../components/tiptap-icons/highlighter-icon'

import '../styles/fullscreen-editor.scss'

export type FullscreenEditorProps = {
  doc: JSONContent
  onCancel?: () => void
  onSave?: (content: { json: JSONContent; html: string }) => void
}

export default function FullscreenEditor({ doc, onCancel, onSave }: FullscreenEditorProps) {
  const extensions = React.useMemo(() => createEditorExtensions({
    placeholder: "Type '/' for commands",
    includeSlashMenu: true,
    includeTrailingNode: true  // Fullscreen editor needs trailing node
  }), [])

  const editor = useEditor({
    extensions,
    content: ensureJsonContent(doc),
    autofocus: 'end',
    editorProps: {},
  })

  const handleSave = React.useCallback(() => {
    if (!editor) return
    const json = ensureJsonContent(editor.getJSON())
    const html = sanitizeAndSave(jsonToHtml(json))
    onSave?.({ json, html })
  }, [editor, onSave])

  if (!editor) return null

  return (
    <div className="tt-shell">
      <EditorContext.Provider value={{ editor }}>
        <Toolbar variant="fixed" className="tt-toolbar">
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
              onClick={() => editor.chain().focus().toggleHighlight().run()}
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
            <ThemeToggle />
          </ToolbarGroup>
          <Spacer />
          {onCancel && (
            <ToolbarGroup>
              <Button type="button" data-style="ghost" onClick={onCancel}>
                Cancel
              </Button>
            </ToolbarGroup>
          )}
          {onSave && (
            <ToolbarGroup>
              <Button type="button" onClick={handleSave}>
                Save
              </Button>
            </ToolbarGroup>
          )}
        </Toolbar>

        <div className="tt-content">
          <EditorContent editor={editor} className="tiptap" />
        </div>
      </EditorContext.Provider>
    </div>
  )
}
