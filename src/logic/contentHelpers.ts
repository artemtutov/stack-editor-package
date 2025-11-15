import type { JSONContent } from '@tiptap/core'
import type { InitialBlock, NormalizedBlock, StackSnapshot } from '../types'
import xxhash from 'xxhash-wasm'

// Algorithm versions for recomputation detection
export const PREVIEW_ALGO_VERSION = 1
export const HASH_ALGO_VERSION = 1

// Singleton for xxhash instance
let xxhashInstance: Awaited<ReturnType<typeof xxhash>> | null = null

async function getHasher() {
  if (!xxhashInstance) {
    xxhashInstance = await xxhash()
  }
  return xxhashInstance
}

/**
 * Extract plain text from TipTap JSONContent recursively
 * @param contentJson TipTap document structure
 * @param maxLen Maximum length of preview (default: 400)
 * @returns Plain text preview
 */
export function extractPreview(contentJson: JSONContent, maxLen = 400): string {
  const text = extractTextRecursive(contentJson)
  const trimmed = text.trim().replace(/\s+/g, ' ') // Normalize whitespace
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) + '…' : trimmed
}

/**
 * Recursively extract all text nodes from JSONContent
 */
function extractTextRecursive(node: JSONContent): string {
  let text = ''

  // Direct text node
  if (node.text) {
    text += node.text
  }

  // Recurse into children
  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      text += extractTextRecursive(child)
      // Add spacing between block elements
      if (isBlockNode(child.type)) {
        text += ' '
      }
    }
  }

  return text
}

/**
 * Check if a node type is a block-level element
 */
function isBlockNode(type?: string): boolean {
  return type !== undefined && [
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
    'taskList',
    'taskItem',
    'blockquote',
    'codeBlock',
    'horizontalRule'
  ].includes(type)
}

/**
 * Detect the primary content type of a block
 * @param contentJson TipTap document structure
 * @returns Content type classification
 */
export function detectContentType(
  contentJson: JSONContent
): 'list' | 'todo' | 'heading' | 'paragraph' {
  if (!contentJson.content || contentJson.content.length === 0) {
    return 'paragraph'
  }

  // Check first meaningful content node
  const firstNode = contentJson.content[0]

  if (!firstNode) {
    return 'paragraph'
  }

  // Task list (todo items)
  if (firstNode.type === 'taskList') {
    return 'todo'
  }

  // Regular lists
  if (firstNode.type === 'bulletList' || firstNode.type === 'orderedList') {
    return 'list'
  }

  // Headings
  if (firstNode.type === 'heading') {
    return 'heading'
  }

  // Default to paragraph
  return 'paragraph'
}

/**
 * Compute fast hash of content using xxhash64
 * @param contentJson TipTap document structure
 * @returns Hex string hash
 */
export async function computeContentHash(contentJson: JSONContent): Promise<string> {
  const normalized = normalizeContentJson(contentJson)
  const jsonString = JSON.stringify(normalized)

  const hasher = await getHasher()
  const hash = hasher.h64ToString(jsonString)

  return hash
}

/**
 * Synchronous version using a simple fast hash (for when async isn't suitable)
 * This is a fallback - prefer computeContentHash when possible
 */
export function computeContentHashSync(contentJson: JSONContent): string {
  const normalized = normalizeContentJson(contentJson)
  const jsonString = JSON.stringify(normalized)

  // Simple FNV-1a hash (fast, non-cryptographic)
  let hash = 2166136261 // FNV offset basis
  for (let i = 0; i < jsonString.length; i++) {
    hash ^= jsonString.charCodeAt(i)
    hash = Math.imul(hash, 16777619) // FNV prime
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Normalize JSONContent for consistent hashing
 * Sorts object keys, removes transient fields, ensures stable structure
 */
export function normalizeContentJson(node: JSONContent): any {
  // Handle null/undefined
  if (node === null || node === undefined) {
    return null
  }

  // Sort keys alphabetically for stable serialization
  const normalized: any = {}

  // Always include type first
  if (node.type) {
    normalized.type = node.type
  }

  // Then content (recursively normalized)
  if (node.content && Array.isArray(node.content)) {
    normalized.content = node.content.map(normalizeContentJson)
  }

  // Then text
  if (node.text !== undefined) {
    normalized.text = node.text
  }

  // Then attrs (sorted)
  if (node.attrs && typeof node.attrs === 'object') {
    normalized.attrs = sortObjectKeys(node.attrs)
  }

  // Then marks (sorted by type)
  if (node.marks && Array.isArray(node.marks)) {
    normalized.marks = node.marks
      .map(mark => ({
        type: mark.type,
        ...(mark.attrs ? { attrs: sortObjectKeys(mark.attrs) } : {})
      }))
      .sort((a, b) => a.type.localeCompare(b.type))
  }

  return normalized
}

/**
 * Sort object keys alphabetically
 */
function sortObjectKeys(obj: Record<string, any>): Record<string, any> {
  const sorted: Record<string, any> = {}
  const keys = Object.keys(obj).sort()

  for (const key of keys) {
    const value = obj[key]

    // Recursively sort nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sorted[key] = sortObjectKeys(value)
    } else if (Array.isArray(value)) {
      // Keep arrays as-is (order matters for content)
      sorted[key] = value
    } else {
      sorted[key] = value
    }
  }

  return sorted
}

/**
 * Extract additional metadata helpers
 */

/**
 * Count items in a list or todo
 */
export function countItems(contentJson: JSONContent): number {
  if (!contentJson.content) return 0

  let count = 0

  for (const node of contentJson.content) {
    if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') {
      // Count list items
      if (node.content) {
        count += node.content.filter(child =>
          child.type === 'listItem' || child.type === 'taskItem'
        ).length
      }
    }
  }

  return count
}

/**
 * Count checked/unchecked todo items
 */
export function getTodoStats(contentJson: JSONContent): { checked: number; total: number } {
  const stats = { checked: 0, total: 0 }

  function traverse(node: JSONContent) {
    if (node.type === 'taskItem') {
      stats.total++
      if (node.attrs?.checked === true) {
        stats.checked++
      }
    }

    if (node.content) {
      for (const child of node.content) {
        traverse(child)
      }
    }
  }

  traverse(contentJson)
  return stats
}

/**
 * Count approximate word count
 */
export function getWordCount(contentJson: JSONContent): number {
  const text = extractTextRecursive(contentJson).trim()
  if (!text) return 0

  // Simple word count by splitting on whitespace
  return text.split(/\s+/).length
}

/**
 * Compute structural hash of blocks for undo/redo deduplication
 * Includes: block IDs, parent IDs, stack IDs, stack indexes, positions (rounded)
 * and content hashes for each block
 *
 * @param blocks Array of block data with structural information
 * @returns Hex string hash representing the current structure
 */
export function computeStructureHash(blocks: Array<{
  id: string
  parentId?: string
  stackId?: string
  stackIndex?: number
  position?: { x: number; y: number }
  contentHash?: string
}>): string {
  // Create a normalized representation of the structure
  const structureData = blocks.map(block => ({
    id: block.id,
    parentId: block.parentId || null,
    stackId: block.stackId || null,
    stackIndex: block.stackIndex ?? null,
    // Round positions to avoid floating point differences
    x: block.position ? Math.round(block.position.x) : null,
    y: block.position ? Math.round(block.position.y) : null,
    contentHash: block.contentHash || null,
  }))

  // Sort by ID for consistent ordering
  structureData.sort((a, b) => a.id.localeCompare(b.id))

  const jsonString = JSON.stringify(structureData)

  // Use FNV-1a hash for fast synchronous computation
  let hash = 2166136261 // FNV offset basis
  for (let i = 0; i < jsonString.length; i++) {
    hash ^= jsonString.charCodeAt(i)
    hash = Math.imul(hash, 16777619) // FNV prime
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Normalize a block snapshot to ensure all required fields are present
 * Computes missing content helpers (contentPreview, contentType, contentHash)
 *
 * @param block Partial block data (e.g., from saved snapshot or undo/redo)
 * @returns Fully normalized block with guaranteed helper fields
 */
export function normalizeBlockSnapshot(block: Partial<InitialBlock>): NormalizedBlock {
  const contentJson = block.contentJson ?? undefined

  // Compute content helpers if missing
  const contentPreview = block.contentPreview ?? extractPreview(contentJson || {})
  const contentType = block.contentType ?? detectContentType(contentJson || {})
  const contentHash = block.contentHash ?? computeContentHashSync(contentJson || {})

  return {
    id: block.id,
    canonicalName: block.canonicalName,
    contentJson,
    html: block.html,
    contentPreview,
    contentType,
    contentHash,
    position: block.position,
    parentId: block.parentId,
    extent: block.extent,
    stackId: block.stackId,
    stackIndex: block.stackIndex,
    containerPosition: block.containerPosition,
    containerParentId: block.containerParentId,
    containerExtent: block.containerExtent,
    containerCanonicalName: block.containerCanonicalName,
    height: block.height,
  }
}

/**
 * Normalize a stack snapshot to ensure all blocks have helpers and structureHash is present
 *
 * @param snapshot Partial snapshot (e.g., from localStorage, undo/redo, or external source)
 * @returns Fully normalized StackSnapshot with guaranteed structureHash and normalized blocks
 */
export function normalizeStackSnapshot(snapshot: {
  version?: number
  blocks?: Array<Partial<InitialBlock>>
  timestamp?: number
  structureHash?: string
}): StackSnapshot {
  // Normalize all blocks
  const blocks = (snapshot.blocks ?? []).map(normalizeBlockSnapshot)

  // Recompute structure hash from normalized blocks
  const structureHash = computeStructureHash(
    blocks.map(b => ({
      id: b.id || '',
      parentId: b.parentId,
      stackId: b.stackId,
      stackIndex: b.stackIndex,
      position: b.position,
      contentHash: b.contentHash,
    }))
  )

  return {
    version: snapshot.version ?? 1,
    blocks,
    timestamp: snapshot.timestamp ?? Date.now(),
    structureHash,
  }
}
