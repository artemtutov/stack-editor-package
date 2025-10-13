import { describe, it, expect } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { blocksToDoc, docToBlocks } from '../src/renderers/FullscreenStackEditor'

describe('Block identity top-level only', () => {
  it('attaches blockId only to top-level nodes and strips on save', () => {
    const blocks = [
      { id: 'a', content: { json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] }, html: '<p>One</p>' } },
      { id: 'b', content: { json: { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] }] }] }, html: '<ul><li>Two</li></ul>' } },
    ]
    const { doc } = blocksToDoc(blocks)
    const tops = (doc.content || []) as any[]
    expect(tops.length).toBe(2)
    expect(tops[0].attrs?.blockId).toBe('a')
    expect(tops[1].attrs?.blockId).toBe('b')

    const round = docToBlocks(doc)
    expect(round[0].id).toBe('a')
    expect(round[1].id).toBe('b')
    // Ensure stripped from per-block JSON
    expect((round[0].content.json.content?.[0] as any)?.attrs?.blockId).toBeUndefined()
    expect((round[1].content.json.content?.[0] as any)?.attrs?.blockId).toBeUndefined()
  })
})

