import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
// Prefer single-extension package to avoid pulling the whole bundle
// Switch to this import once the dependency is installed locally:
// import TrailingNode from '@tiptap/extension-trailing-node'
import { TrailingNode } from '@tiptap/extensions'
import { BlockIdentity } from '../extensions/BlockIdentity'
import type { Extensions } from '@tiptap/core'

export type ExtensionFactoryOptions = {
  placeholder?: string
  includeSlashMenu?: boolean
}

const DEFAULT_PLACEHOLDER = "Type '/' for commands"

/**
 * Shared extension set used across canvas and fullscreen editors.
 */
export function createEditorExtensions(options?: ExtensionFactoryOptions): Extensions {
  const placeholderText = options?.placeholder ?? DEFAULT_PLACEHOLDER

  const base: Extensions = [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      codeBlock: false,
    }),
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
      placeholder: placeholderText,
      showOnlyWhenEditable: true,
    }),
    TrailingNode.configure({ node: 'paragraph' }),
    BlockIdentity,
  ]

  // Optional slash commands (Suggestion-based). Enabled only when requested.
  // Slash commands via @tiptap/suggestion can be added here when available.
  
  return base
}
