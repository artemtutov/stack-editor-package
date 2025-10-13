import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Adds a stable `blockId` attribute to top-level block nodes so
 * fullscreen doc <-> canvas blocks can be diffed reliably.
 *
 * Uses a "ledger" (plugin state) as the source of truth for block identity,
 * independent of TipTap's node attrs. This prevents identity loss during
 * multi-step transformations (e.g., paragraph → heading).
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
            // Keep blockId when splitting blocks
            keepOnSplit: false,
            // Parse from HTML data attribute (for HTML paste/import)
            parseHTML: (element) => element.getAttribute('data-block-id'),
            // Do not emit identity in HTML; keep it JSON-only for diffing.
            renderHTML: () => ({}),
          },
        },
      },
    ]
  },
  addProseMirrorPlugins() {
    const TOP_LEVEL_TYPES = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList']
    const stripperKey = new PluginKey('blockIdTopLevelStripper')
    const ledgerKey = new PluginKey<(string | null)[]>('blockIdLedger')

    /**
     * Helper: collect top-level nodes (node, startPos) for a doc, EXCLUDING trailing empty paragraph.
     */
    function getTopLevelNodes(doc: PMNode): Array<{ node: PMNode; pos: number }> {
      const out: Array<{ node: PMNode; pos: number }> = []
      let pos = 0
      for (let i = 0; i < doc.childCount; i++) {
        const child = doc.child(i)

        // Exclude trailing empty paragraph ONLY if it's a TipTap placeholder (no blockId)
        // Keep user's intentional empty blocks that have blockIds
        const isLast = i === doc.childCount - 1
        const isEmpty = child.content.size === 0
        const isParagraph = child.type.name === 'paragraph'
        const hasBlockId = !!child.attrs?.blockId
        if (isLast && isEmpty && isParagraph && !hasBlockId) {
          break
        }

        out.push({ node: child, pos })
        pos += child.nodeSize
      }
      return out
    }

    /**
     * Helper: generate a new UUID for block identity
     */
    function mintBlockId(): string {
      return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    return [
      /**
       * Plugin 1: Block Identity Ledger
       * Maintains a source-of-truth array of blockIds, independent of node attrs.
       * This survives multi-step TipTap transformations.
       */
      new Plugin({
        key: ledgerKey,
        state: {
          init: (_, state) => {
            // Initialize ledger from existing blockIds in the document
            const topNodes = getTopLevelNodes(state.doc)
            const ledger = topNodes.map(({ node }) => node.attrs?.blockId || null)

            if (process.env.NODE_ENV !== 'production') {
              console.log('[BlockLedger] Initialized:', ledger)
            }

            return ledger
          },
          apply: (tr, ledgerOld, oldState, newState) => {
            if (!tr.docChanged) return ledgerOld

            if (process.env.NODE_ENV !== 'production') {
              console.log('[BlockLedger] Transaction detected')
            }

            const oldTop = getTopLevelNodes(oldState.doc)
            const newTop = getTopLevelNodes(newState.doc)

            // Build mapping from all steps in the transaction
            const mapping = new Mapping()
            for (let i = 0; i < tr.mapping.maps.length; i++) {
              mapping.appendMap(tr.mapping.maps[i], tr.mapping.getMirror(i))
            }

            // Initialize new ledger array
            const ledgerNew: (string | null)[] = new Array(newTop.length).fill(null)

            if (process.env.NODE_ENV !== 'production') {
              console.log('[BlockLedger] State:', {
                oldTopCount: oldTop.length,
                newTopCount: newTop.length,
                oldLedger: ledgerOld,
              })
            }

            // Process each old block
            for (let oldIndex = 0; oldIndex < oldTop.length; oldIndex++) {
              const oldId = ledgerOld[oldIndex]
              if (!oldId) continue // Skip blocks without IDs

              const { pos: oldPos } = oldTop[oldIndex]

              // STRATEGY 1: Try mapping first (handles reorders/moves)
              const mapRes = mapping.mapResult(oldPos, -1)

              if (!mapRes.deleted) {
                // Mapping succeeded - find which new index this maps to
                for (let newIndex = 0; newIndex < newTop.length; newIndex++) {
                  const { pos: newPos } = newTop[newIndex]
                  // Check if mapped position is within this node's range
                  const newNode = newTop[newIndex].node
                  if (mapRes.pos >= newPos && mapRes.pos < newPos + newNode.nodeSize) {
                    // Only assign if not already taken
                    if (ledgerNew[newIndex] === null) {
                      ledgerNew[newIndex] = oldId

                      if (process.env.NODE_ENV !== 'production') {
                        console.log('[BlockLedger] Mapped:', {
                          oldIndex,
                          newIndex,
                          blockId: oldId,
                        })
                      }
                    }
                    break
                  }
                }
              } else {
                // STRATEGY 2: Mapping reported deleted - use index fallback (transforms)
                if (oldIndex < newTop.length && ledgerNew[oldIndex] === null) {
                  ledgerNew[oldIndex] = oldId

                  if (process.env.NODE_ENV !== 'production') {
                    console.log('[BlockLedger] Index fallback:', {
                      oldIndex,
                      blockId: oldId,
                    })
                  }
                }
              }
            }

            // Mint new IDs for any null entries
            for (let i = 0; i < ledgerNew.length; i++) {
              if (ledgerNew[i] === null) {
                ledgerNew[i] = mintBlockId()

                if (process.env.NODE_ENV !== 'production') {
                  console.log('[BlockLedger] Minted new ID:', {
                    index: i,
                    blockId: ledgerNew[i],
                  })
                }
              }
            }

            if (process.env.NODE_ENV !== 'production') {
              console.log('[BlockLedger] New ledger:', ledgerNew)
            }

            return ledgerNew
          },
        },
        appendTransaction: (trs, oldState, newState) => {
          if (!trs.some(t => t.docChanged)) return null

          // Get the current ledger
          const ledger = ledgerKey.getState(newState)
          if (!ledger) return null

          const topNodes = getTopLevelNodes(newState.doc)
          let tr = newState.tr
          let changed = false

          // Sync ledger IDs to node attrs
          topNodes.forEach(({ node, pos }, index) => {
            const ledgerId = ledger[index]
            const nodeId = node.attrs?.blockId

            if (ledgerId && ledgerId !== nodeId) {
              tr = tr.setNodeMarkup(
                pos,
                node.type,
                { ...node.attrs, blockId: ledgerId },
                node.marks
              )
              changed = true

              if (process.env.NODE_ENV !== 'production') {
                console.log('[BlockLedger] Synced to attrs:', {
                  index,
                  blockId: ledgerId,
                  nodeType: node.type.name,
                })
              }
            }
          })

          return changed ? tr : null
        },
      }),

      /**
       * Plugin 2: Strip blockId from NON-top-level nodes (hygiene).
       */
      new Plugin({
        key: stripperKey,
        appendTransaction: (trs, oldState, newState) => {
          if (!trs.some(t => t.docChanged)) return null

          const { doc } = newState
          let tr = newState.tr
          let changed = false

          // Traverse with parent info using descendants
          doc.descendants((node, pos, parent) => {
            const isTopLevel = !!parent && parent.type === doc.type
            if (!isTopLevel && node.attrs?.blockId) {
              // strip from non-top-level nodes
              tr = tr.setNodeMarkup(pos, node.type, { ...node.attrs, blockId: null }, node.marks)
              changed = true

              if (process.env.NODE_ENV !== 'production') {
                console.log('[BlockIdentity] strip non-top-level', {
                  type: node.type.name,
                  pos,
                })
              }
            }
            return true
          })

          return changed ? tr : null
        },
      }),
    ]
  },
})

export default BlockIdentity
