import type { JSONContent } from '@tiptap/core'

export function upgradeContentJson(json: JSONContent, fromVersion: number, toVersion: number): JSONContent {
  // TODO: implement schema migrations when extension set changes.
  // For now, no-op upgrade with logging for visibility.
  if (fromVersion !== toVersion) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info('[SchemaUpgrade] Upgrading content JSON', { fromVersion, toVersion })
    }
  }
  return json
}

