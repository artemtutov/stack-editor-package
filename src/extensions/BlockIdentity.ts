import { Extension } from '@tiptap/core'

/**
 * Adds a stable `blockId` attribute to top-level block nodes so
 * fullscreen doc <-> canvas blocks can be diffed reliably.
 */
export const BlockIdentity = Extension.create({
  name: 'blockIdentity',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList'],
        attributes: {
          blockId: {
            default: null,
            // Do not emit identity in HTML; keep it JSON-only for diffing.
            renderHTML: () => ({}),
          },
        },
      },
    ]
  },
})

export default BlockIdentity
