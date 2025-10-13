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

export function mergePayloads(first: RichTextPayload, second: RichTextPayload): RichTextPayload {
  const firstJson = ensureJsonContent(first.json)
  const secondJson = ensureJsonContent(second.json)

  const mergedJson: JSONContent = {
    type: 'doc',
    content: [
      ...(firstJson.content ?? []),
      ...(secondJson.content ?? []),
    ],
  }

  const html = sanitizeAndSave(jsonToHtml(mergedJson))
  return { json: mergedJson, html }
}
