import type { JSONContent } from '@tiptap/core'
import { generateHTML, generateJSON } from '@tiptap/html'
import { createEditorExtensions } from './extensions'
import { sanitizeAndSave } from '../utils/sanitizeHTML'
import type { RichTextPayload } from '../types'

export const CURRENT_SCHEMA_VERSION = 1

const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [],
    },
  ],
}

export function ensureJsonContent(json?: JSONContent | null): JSONContent {
  if (!json || !Array.isArray(json.content) || json.content.length === 0) {
    return EMPTY_DOC
  }
  return json
}

/**
 * Removes trailing empty paragraphs from a document.
 * This cleans up legacy content that may have trailing paragraphs from previous saves.
 * Only removes empty paragraphs at the end; preserves user-created empty blocks.
 */
export function cleanTrailingParagraphs(json: JSONContent): JSONContent {
  const cleaned = ensureJsonContent(json)
  if (!cleaned.content || cleaned.content.length === 0) return cleaned

  let content = [...(cleaned.content as any[])]

  // Keep removing trailing empty paragraphs until we hit content or reach minimum
  while (content.length > 1) {
    const lastNode = content[content.length - 1]
    if (lastNode?.type === 'paragraph' && (!lastNode.content || lastNode.content.length === 0)) {
      content = content.slice(0, -1)
    } else {
      break
    }
  }

  return { ...cleaned, content }
}

export function htmlToJson(html: string): JSONContent {
  const json = generateJSON(html || '', createEditorExtensions())
  return ensureJsonContent(json)
}

export function jsonToHtml(json: JSONContent): string {
  const validJson = ensureJsonContent(json)
  return generateHTML(validJson, createEditorExtensions())
}

export function createEmptyPayload(): RichTextPayload {
  const json = EMPTY_DOC
  const html = sanitizeAndSave(jsonToHtml(json))
  return { json, html }
}

/**
 * Extracts inline content from a block node (paragraph, heading, listItem paragraph, etc.)
 * Returns an array of inline nodes (text, marks, etc.)
 */
function extractInlineContent(node: JSONContent): JSONContent[] {
  if (node.type === 'paragraph' || node.type === 'heading') {
    return node.content || []
  }
  // For other blocks, try to extract from first paragraph child
  if (node.content && node.content.length > 0) {
    const firstChild = node.content[0]
    if (firstChild.type === 'paragraph') {
      return firstChild.content || []
    }
  }
  return []
}

/**
 * Merges two payloads into a single valid top-level block node.
 * This is critical for single-block schema (content: 'block') to prevent PM from dropping nodes.
 *
 * Rules:
 * - paragraph + paragraph/heading → keep prev type, append inline with space
 * - heading + paragraph/heading → keep prev heading, append inline
 * - list + paragraph/heading → append as new listItem
 * - list + list (same) → concat listItems
 * - list + list (different) → keep prev type, convert items
 * - blockquote + paragraph → append paragraph inside blockquote
 */
export function mergePayloads(first: RichTextPayload, second: RichTextPayload): RichTextPayload {
  const firstJson = ensureJsonContent(first.json)
  const secondJson = ensureJsonContent(second.json)

  const firstNode = firstJson.content?.[0]
  const secondNode = secondJson.content?.[0]

  if (!firstNode || !secondNode) {
    // Fallback: if either is missing, return the one that exists
    const mergedJson = firstNode ? firstJson : secondJson
    const html = sanitizeAndSave(jsonToHtml(mergedJson))
    return { json: mergedJson, html }
  }

  let mergedNode: JSONContent

  // Case 1: paragraph + (paragraph | heading)
  if (firstNode.type === 'paragraph' && (secondNode.type === 'paragraph' || secondNode.type === 'heading')) {
    const firstInline = extractInlineContent(firstNode)
    const secondInline = extractInlineContent(secondNode)
    mergedNode = {
      type: 'paragraph',
      content: [
        ...firstInline,
        ...secondInline,
      ],
    }
  }
  // Case 2: heading + (paragraph | heading)
  else if (firstNode.type === 'heading') {
    const firstInline = extractInlineContent(firstNode)
    const secondInline = extractInlineContent(secondNode)
    mergedNode = {
      type: 'heading',
      attrs: firstNode.attrs, // preserve heading level
      content: [
        ...firstInline,
        ...secondInline,
      ],
    }
  }
  // Case 3: list + (paragraph | heading) → append as new listItem
  else if ((firstNode.type === 'bulletList' || firstNode.type === 'orderedList') &&
           (secondNode.type === 'paragraph' || secondNode.type === 'heading')) {
    const secondInline = extractInlineContent(secondNode)
    const newListItem: JSONContent = {
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: secondInline,
        },
      ],
    }
    mergedNode = {
      ...firstNode,
      content: [
        ...(firstNode.content || []),
        newListItem,
      ],
    }
  }
  // Case 4: list + list (same type) → concat listItems
  else if (firstNode.type === secondNode.type &&
           (firstNode.type === 'bulletList' || firstNode.type === 'orderedList')) {
    mergedNode = {
      ...firstNode,
      content: [
        ...(firstNode.content || []),
        ...(secondNode.content || []),
      ],
    }
  }
  // Case 5: list + list (different type) → keep first type, append items
  else if ((firstNode.type === 'bulletList' || firstNode.type === 'orderedList') &&
           (secondNode.type === 'bulletList' || secondNode.type === 'orderedList')) {
    mergedNode = {
      ...firstNode,
      content: [
        ...(firstNode.content || []),
        ...(secondNode.content || []), // listItems work in both list types
      ],
    }
  }
  // Case 6: blockquote + paragraph → append paragraph inside blockquote
  else if (firstNode.type === 'blockquote' && secondNode.type === 'paragraph') {
    mergedNode = {
      type: 'blockquote',
      content: [
        ...(firstNode.content || []),
        secondNode,
      ],
    }
  }
  // Fallback: if types don't match any rule, convert second to paragraph and append inline
  else {
    const firstInline = extractInlineContent(firstNode)
    const secondInline = extractInlineContent(secondNode)
    mergedNode = {
      type: 'paragraph',
      content: [
        ...firstInline,
        ...secondInline,
      ],
    }
  }

  const mergedJson: JSONContent = {
    type: 'doc',
    content: [mergedNode],
  }

  const html = sanitizeAndSave(jsonToHtml(mergedJson))
  return { json: mergedJson, html }
}

/**
 * Helper to calculate the size of a single node (not a doc)
 * In ProseMirror, block nodes contribute 1 (open tag) + content size + 1 (close tag)
 */
export function calculateNodeSize(node: JSONContent): number {
  if (node.type === 'text') {
    // Text nodes just contribute their text length
    return node.text?.length || 0
  }

  // Block nodes (paragraph, heading, list, etc.) contribute:
  // 1 (open tag) + content size + 1 (close tag)
  let contentSize = 0
  if (node.content && node.content.length > 0) {
    contentSize = node.content.reduce((sum, child) => sum + calculateNodeSize(child), 0)
  }

  return 1 + contentSize + 1
}

/**
 * Calculates the ProseMirror content length from JSONContent.
 * This returns the size of the content, which is used to position the cursor at the merge point.
 *
 * For a document with content like [paragraph("Hello"), paragraph("World")]:
 * - First paragraph: 1 (open) + 5 (text) + 1 (close) = 7
 * - Second paragraph: 1 (open) + 5 (text) + 1 (close) = 7
 * - Total content size: 14
 *
 * @param json The JSONContent (should be a doc node)
 * @returns The position at the end of the content
 */
export function calculateContentLength(json: JSONContent): number {
  const validJson = ensureJsonContent(json)

  if (!validJson.content || validJson.content.length === 0) {
    return 0
  }

  // Calculate the size of all content nodes inside the doc
  return validJson.content.reduce((sum, child) => sum + calculateNodeSize(child), 0)
}

/**
 * Calculates just the inline text length from a document's first block node.
 * This is used for cursor positioning during merge operations.
 *
 * For paragraph("hel"), returns 3 (just the text length).
 * For heading("hello"), returns 5 (just the text length).
 *
 * This does NOT include block wrapper tags, giving the correct cursor position
 * for ProseMirror's text selection.
 */
export function calculateInlineTextLength(json: JSONContent): number {
  const validJson = ensureJsonContent(json)
  const firstBlock = validJson.content?.[0]

  if (!firstBlock) {
    return 0
  }

  // Extract inline content and sum up text lengths
  const inlineContent = extractInlineContent(firstBlock)

  return inlineContent.reduce((sum, node) => {
    if (node.type === 'text') {
      return sum + (node.text?.length || 0)
    }
    // For other inline nodes (hard break, etc.), they take 1 position
    return sum + 1
  }, 0)
}
