// Gameplay footprints stay authoritative. This only gives the Geyser's
// short-lived launch art enough height to communicate displacement.
export function structureDisplaySize(type, footprintWidth, footprintHeight, state) {
  if (type === 'WATER_SPECIAL' && state === 'active') {
    return { width: footprintWidth, height: 64 }
  }
  return { width: footprintWidth, height: footprintHeight }
}
