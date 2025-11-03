import StarterKit from '@tiptap/starter-kit'
import Document from '@tiptap/extension-document'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
// Prefer single-extension package to avoid pulling the whole bundle
// Switch to this import once the dependency is installed locally:
// import TrailingNode from '@tiptap/extension-trailing-node'
import { TrailingNode } from '@tiptap/extensions'
import { BlockIdentity } from '../extensions/BlockIdentity'
import type { Extensions } from '@tiptap/core'

export type ExtensionFactoryOptions = {
  placeholder?: string
  includeSlashMenu?: boolean
  includeTrailingNode?: boolean
  singleBlock?: boolean
  includeTasks?: boolean
}

const DEFAULT_PLACEHOLDER = "Type '/' for commands"

/**
 * Shared extension set used across canvas and fullscreen editors.
 */
export function createEditorExtensions(options?: ExtensionFactoryOptions): Extensions {
  const placeholderText = options?.placeholder ?? DEFAULT_PLACEHOLDER
  const includeTrailingNode = options?.includeTrailingNode ?? false
  const singleBlock = options?.singleBlock ?? false
  const includeTasks = options?.includeTasks ?? false

  const base: Extensions = [
    // Add single-block Document for individual block editors (prevents trailing paragraphs)
    // Default Document (block+) allows multiple top-level nodes - used in fullscreen
    ...(singleBlock
      ? [Document.extend({ content: 'block' })]
      : []),
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      codeBlock: false,
      // Disable default Document if using single-block schema
      document: singleBlock ? false : undefined,
      // Disable Link and Underline to use explicit imports below with custom config
      link: false,
      underline: false,
    }),
    // Add TaskList/TaskItem when requested
    ...(includeTasks ? [TaskList, TaskItem.configure({ nested: false })] : []),
    Underline,
    Highlight,
    Link.configure({
      protocols: ['https', 'mailto'],
      openOnClick: false,
      linkOnPaste: true,
      autolink: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer',
      },
      validate: (href) => {
        if (!href) return false
        return href.startsWith('https:') || href.startsWith('mailto:')
      },
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({
      placeholder: ({ editor }) => {
        const doc = editor.state.doc
        // Only show placeholder if document is truly empty
        // (single empty paragraph or completely empty)
        if (doc.childCount === 1) {
          const firstChild = doc.firstChild
          if (firstChild?.type.name === 'paragraph' && firstChild.content.size === 0) {
            return placeholderText
          }
        }
        return ''
      },
      showOnlyWhenEditable: true,
    }),
    BlockIdentity,
  ]

  // Add TrailingNode only for fullscreen/multi-block editors
  // Individual block editors don't need it (causes unnecessary whitespace)
  if (includeTrailingNode) {
    base.push(TrailingNode.configure({ node: 'paragraph' }))
  }

  // Optional slash commands (Suggestion-based). Enabled only when requested.
  // Slash commands via @tiptap/suggestion can be added here when available.

  return base
}
