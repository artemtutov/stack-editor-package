/**
 * Canonical naming system for stable block and stack identification
 */

// Reserved prefixes that cannot be used by user-defined names
const RESERVED_PREFIXES = ['blk:', 'stack:', 'text:', 'group:'] as const

// Error codes
export class CanonicalNameError extends Error {
  constructor(
    public code: string,
    message: string,
    public meta?: Record<string, any>
  ) {
    super(message)
    this.name = 'CanonicalNameError'
  }
}

/**
 * Normalize a canonical name to ensure consistency
 * - Lowercase
 * - Trim whitespace
 * - Validate allowed characters [a-z0-9_-:]
 */
export function normalizeCanonicalName(name: string): string {
  const normalized = name.trim().toLowerCase()

  // Validate characters
  if (!/^[a-z0-9_\-:]+$/.test(normalized)) {
    throw new CanonicalNameError(
      'INVALID_CANONICAL',
      `Canonical name contains invalid characters. Only [a-z0-9_-:] allowed: "${name}"`,
      { name, normalized }
    )
  }

  return normalized
}

/**
 * Validate that a name doesn't use reserved prefixes
 */
export function validateNotReserved(name: string): void {
  for (const prefix of RESERVED_PREFIXES) {
    if (name.startsWith(prefix)) {
      throw new CanonicalNameError(
        'RESERVED_PREFIX',
        `Canonical name cannot start with reserved prefix "${prefix}": "${name}"`,
        { name, prefix }
      )
    }
  }
}

/**
 * Generate a canonical name with a reserved prefix
 * @param prefix Type of entity ('block' or 'stack')
 * @param id Optional ID to use, otherwise generates random suffix
 */
export function generateCanonicalName(prefix: 'block' | 'stack', id?: string): string {
  const shortId = id
    ? id.replace(/-/g, '').slice(0, 8) // Remove hyphens, take first 8 chars
    : Math.random().toString(36).substring(2, 10) // Random 8 char string

  return prefix === 'block' ? `blk:${shortId}` : `stack:${shortId}`
}

/**
 * Registry for tracking canonical names and preventing conflicts
 */
export class CanonicalNameRegistry {
  // Map: canonicalName -> { id, type }
  private nameToEntity = new Map<string, { id: string; type: string }>()

  // Map: id -> canonicalName (reverse lookup)
  private idToName = new Map<string, string>()

  /**
   * Register a canonical name
   * @throws CanonicalNameError with code CANONICAL_CONFLICT if name exists
   */
  register(name: string, id: string, type: 'block' | 'stack' | 'group'): void {
    const normalized = normalizeCanonicalName(name)

    // Check for conflicts
    const existing = this.nameToEntity.get(normalized)
    if (existing && existing.id !== id) {
      throw new CanonicalNameError(
        'CANONICAL_CONFLICT',
        `Canonical name "${normalized}" is already registered to ${existing.type} with id "${existing.id}"`,
        {
          name: normalized,
          requestedId: id,
          existingId: existing.id,
          existingType: existing.type
        }
      )
    }

    // If same ID is already registered with different name, unregister old name first
    const oldName = this.idToName.get(id)
    if (oldName && oldName !== normalized) {
      this.nameToEntity.delete(oldName)
    }

    // Register
    this.nameToEntity.set(normalized, { id, type })
    this.idToName.set(id, normalized)
  }

  /**
   * Unregister a canonical name (e.g., when entity is deleted)
   */
  unregister(name: string): void {
    const normalized = normalizeCanonicalName(name)
    const entity = this.nameToEntity.get(normalized)

    if (entity) {
      this.nameToEntity.delete(normalized)
      this.idToName.delete(entity.id)
    }
  }

  /**
   * Unregister by ID
   */
  unregisterById(id: string): void {
    const name = this.idToName.get(id)
    if (name) {
      this.nameToEntity.delete(name)
      this.idToName.delete(id)
    }
  }

  /**
   * Check if a canonical name is registered
   */
  has(name: string): boolean {
    const normalized = normalizeCanonicalName(name)
    return this.nameToEntity.has(normalized)
  }

  /**
   * Resolve canonical name to ID (O(1) lookup)
   * @returns ID if found, null otherwise
   */
  resolve(name: string): string | null {
    const normalized = normalizeCanonicalName(name)
    const entity = this.nameToEntity.get(normalized)
    return entity ? entity.id : null
  }

  /**
   * Resolve ID to canonical name (reverse lookup)
   * @returns Canonical name if found, null otherwise
   */
  resolveName(id: string): string | null {
    return this.idToName.get(id) ?? null
  }

  /**
   * Rename a canonical name (atomic operation)
   * @throws CanonicalNameError if newName conflicts with existing name
   */
  rename(oldName: string, newName: string): void {
    const normalizedOld = normalizeCanonicalName(oldName)
    const normalizedNew = normalizeCanonicalName(newName)

    // Check old name exists
    const entity = this.nameToEntity.get(normalizedOld)
    if (!entity) {
      throw new CanonicalNameError(
        'BLOCK_NOT_FOUND',
        `Cannot rename: canonical name "${normalizedOld}" not found`,
        { oldName: normalizedOld, newName: normalizedNew }
      )
    }

    // Check new name doesn't conflict (unless it's the same entity)
    const existingNew = this.nameToEntity.get(normalizedNew)
    if (existingNew && existingNew.id !== entity.id) {
      throw new CanonicalNameError(
        'CANONICAL_CONFLICT',
        `Cannot rename to "${normalizedNew}": name already exists for ${existingNew.type} "${existingNew.id}"`,
        {
          oldName: normalizedOld,
          newName: normalizedNew,
          conflictingId: existingNew.id,
          conflictingType: existingNew.type
        }
      )
    }

    // Perform rename
    this.nameToEntity.delete(normalizedOld)
    this.nameToEntity.set(normalizedNew, entity)
    this.idToName.set(entity.id, normalizedNew)
  }

  /**
   * Get all registered names
   */
  getAllNames(): string[] {
    return Array.from(this.nameToEntity.keys())
  }

  /**
   * Get all registered IDs
   */
  getAllIds(): string[] {
    return Array.from(this.idToName.keys())
  }

  /**
   * Get count of registered names
   */
  size(): number {
    return this.nameToEntity.size
  }

  /**
   * Clear all registrations (useful for tests or resets)
   */
  clear(): void {
    this.nameToEntity.clear()
    this.idToName.clear()
  }

  /**
   * Validate uniqueness of a batch of names
   * @returns Array of conflicts found
   */
  validateBatch(
    names: Array<{ name: string; id: string; type: string }>
  ): Array<{ name: string; conflictingWith: string }> {
    const conflicts: Array<{ name: string; conflictingWith: string }> = []
    const seenNames = new Map<string, string>()

    for (const { name, id } of names) {
      const normalized = normalizeCanonicalName(name)

      // Check against already seen in this batch
      const seenId = seenNames.get(normalized)
      if (seenId && seenId !== id) {
        conflicts.push({ name: normalized, conflictingWith: seenId })
        continue
      }

      // Check against registry
      const existing = this.nameToEntity.get(normalized)
      if (existing && existing.id !== id) {
        conflicts.push({ name: normalized, conflictingWith: existing.id })
        continue
      }

      seenNames.set(normalized, id)
    }

    return conflicts
  }

  /**
   * Generate a unique name with auto-suffix if needed
   * This is opt-in functionality, not default behavior
   */
  generateUniqueName(baseName: string, maxAttempts = 100): string {
    const normalized = normalizeCanonicalName(baseName)

    // Try base name first
    if (!this.nameToEntity.has(normalized)) {
      return normalized
    }

    // Try with numeric suffixes
    for (let i = 2; i <= maxAttempts; i++) {
      const candidate = `${normalized}-${i}`
      if (!this.nameToEntity.has(candidate)) {
        return candidate
      }
    }

    throw new CanonicalNameError(
      'UNIQUE_NAME_EXHAUSTED',
      `Could not generate unique name for "${baseName}" after ${maxAttempts} attempts`,
      { baseName: normalized, maxAttempts }
    )
  }
}
