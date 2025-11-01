/**
 * Global logging control utility
 *
 * Overrides console.log to be toggleable while keeping warn/error intact.
 * Use console.info() for logs you always want to see.
 */

// Save original console methods
const originalLog = console.log.bind(console)
const originalDebug = console.debug.bind(console)

// Global flag
let loggingEnabled = false

// Override console.log and console.debug
console.log = (...args: any[]) => {
  if (loggingEnabled) {
    originalLog(...args)
  }
}

console.debug = (...args: any[]) => {
  if (loggingEnabled) {
    originalDebug(...args)
  }
}

/**
 * Enable console.log and console.debug output
 */
export function enableLogging() {
  loggingEnabled = true
  originalLog('📝 Logging enabled')
}

/**
 * Disable console.log and console.debug output
 */
export function disableLogging() {
  loggingEnabled = false
}

/**
 * Check if logging is currently enabled
 */
export function isLoggingEnabled(): boolean {
  return loggingEnabled
}

/**
 * Initialize logging state (called once at startup)
 */
export function initializeLogging(enabled = false) {
  loggingEnabled = enabled
  if (enabled) {
    originalLog('📝 Logging initialized (enabled)')
  }
}
