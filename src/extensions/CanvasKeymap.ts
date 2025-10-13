import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface CanvasKeymapOptions {
  onEnterBelow: () => void
  onMergeUp: () => void
  onFocusPrev: () => void
  onFocusNext: () => void
  onTabPrev: () => void
  onTabNext: () => void
  onDeleteBlock: () => void
}

export const CanvasKeymap = Extension.create<CanvasKeymapOptions>({
  name: 'canvasKeymap',

  addOptions() {
    return {
      onEnterBelow: () => {},
      onMergeUp: () => {},
      onFocusPrev: () => {},
      onFocusNext: () => {},
      onTabPrev: () => {},
      onTabNext: () => {},
      onDeleteBlock: () => {},
    }
  },

  addProseMirrorPlugins() {
    const { onEnterBelow, onMergeUp, onFocusPrev, onFocusNext, onTabPrev, onTabNext, onDeleteBlock } = this.options

    return [
      new Plugin({
        key: new PluginKey('canvasKeymap'),
        props: {
          handleKeyDown: (view, event) => {
            const { state } = view
            const { selection } = state
            const { $from, $to } = selection

            if ((view as any).composing) {
              return false
            }

            const atStart = view.endOfTextblock('backward', state)
            const atEnd = view.endOfTextblock('forward', state)

            const $pos = state.doc.resolve($from.pos)
            const isInList = $pos.parent.type.name === 'listItem'

            if (event.key === 'Enter' && !event.shiftKey && atEnd && !isInList) {
              event.preventDefault()
              onEnterBelow()
              return true
            }

            if (event.key === 'Backspace' && atStart && $from.sameParent($to)) {
              event.preventDefault()
              const isEmpty = !state.doc.textContent || state.doc.textContent.trim().length === 0
              if (isEmpty) {
                onDeleteBlock()
              } else {
                onMergeUp()
              }
              return true
            }

            if (event.key === 'ArrowUp' && atStart) {
              event.preventDefault()
              onFocusPrev()
              return true
            }

            if (event.key === 'ArrowDown' && atEnd) {
              event.preventDefault()
              onFocusNext()
              return true
            }

            if (event.key === 'Tab') {
              if (!isInList) {
                event.preventDefault()
                if (event.shiftKey) {
                  onTabPrev()
                } else {
                  onTabNext()
                }
                return true
              }
            }

            return false
          },
        },
      }),
    ]
  },
})
