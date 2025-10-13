let activeEditorCount = 0

function isDevelopment() {
  const env =
    (typeof globalThis !== 'undefined' && (globalThis as any).process?.env) as
      | Record<string, string | undefined>
      | undefined
  return env?.NODE_ENV === 'development'
}

export function incrementEditorCount() {
  activeEditorCount += 1
  if (isDevelopment()) {
    console.log(`📝 Active editors: ${activeEditorCount}`)
  }
}

export function decrementEditorCount() {
  activeEditorCount = Math.max(0, activeEditorCount - 1)
  if (isDevelopment()) {
    console.log(`📝 Active editors: ${activeEditorCount}`)
  }
}

export function getActiveEditorCount() {
  return activeEditorCount
}
