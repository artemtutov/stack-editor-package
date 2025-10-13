import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

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
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_trs, _oldState, newState) => {
          const { doc } = newState
          let tr = newState.tr
          let changed = false
          doc.descendants((node, pos) => {
            const depth = newState.doc.resolve(pos).depth
            if (depth !== 1) {
              const attrs = (node.attrs || {}) as any
              if (attrs && attrs.blockId) {
                const nextAttrs = { ...attrs }
                delete nextAttrs.blockId
                tr = tr.setNodeMarkup(pos, node.type, nextAttrs, node.marks)
                changed = true
              }
            }
          })
          return changed ? tr : null
        },
      }),
    ]
  },
})

export default BlockIdentity
