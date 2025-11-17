/**
 * Extracts client coordinates from mouse or touch events.
 *
 * On mobile devices, drag events can be TouchEvents instead of MouseEvents.
 * This utility normalizes coordinate extraction across both event types.
 *
 * @param evt - The mouse or touch event from a drag handler
 * @returns Object with x and y coordinates in client space
 */
export function getEventCoordinates(
  evt: React.MouseEvent | React.TouchEvent
): { x: number; y: number } {
  // Check for active touches (during drag)
  if ('touches' in evt && evt.touches.length > 0) {
    return {
      x: evt.touches[0].clientX,
      y: evt.touches[0].clientY
    }
  }

  // Check for ended touches (touchend event - when finger lifts)
  if ('changedTouches' in evt && evt.changedTouches.length > 0) {
    return {
      x: evt.changedTouches[0].clientX,
      y: evt.changedTouches[0].clientY
    }
  }

  // Mouse event
  if ('clientX' in evt && 'clientY' in evt) {
    return {
      x: evt.clientX,
      y: evt.clientY
    }
  }

  // Fallback - should not happen in normal usage
  console.warn('Unable to extract coordinates from event:', evt)
  return { x: 0, y: 0 }
}
