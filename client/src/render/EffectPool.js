// Task 17: a bounded object pool for frequent, short-lived render effects
// (floating damage numbers, impact rings). Two problems it solves:
//
//   1. Allocation churn — the server caps fx PER TYPE per emit, but at 20 Hz a
//      busy fight still creates and destroys hundreds of Text/Arc objects a
//      second. Pooled objects are created once and re-shown.
//   2. Simultaneous instances — the per-emit cap says nothing about how many
//      effects can be ALIVE at once (a 650 ms damage-number tween outlives ~13
//      emits). `cap` is the hard ceiling on concurrently live objects; over it,
//      acquire() refuses rather than growing without bound.
//
// Phaser-free and duck-typed: `create` builds an object, `reset` re-arms it for
// a new use, `hide` parks it on release. Objects only need a `destroy()` for
// pool teardown.
export class EffectPool {
  constructor({ create, reset = null, hide = null, cap = 24 } = {}) {
    if (typeof create !== 'function') throw new TypeError('EffectPool needs a create() factory')
    this.create = create
    this.reset = reset
    this.hide = hide
    this.cap = cap
    this.active = new Set()
    this.free = []
    this.destroyed = false
  }

  get activeCount() { return this.active.size }
  get freeCount() { return this.free.length }

  // Returns a ready object, or null when the pool is at its cap (callers treat
  // null as "skip this effect" — dropping the least important cosmetic frame
  // is always better than unbounded growth).
  acquire(...args) {
    if (this.destroyed || this.active.size >= this.cap) return null
    const obj = this.free.pop() ?? this.create()
    if (this.reset) this.reset(obj, ...args)
    this.active.add(obj)
    return obj
  }

  // Returns whether the object was actually live here — a double release, or a
  // release of something this pool never handed out, is a no-op rather than a
  // duplicate free-list entry (which would hand the same object to two callers).
  release(obj) {
    if (!this.active.delete(obj)) return false
    if (this.hide) this.hide(obj)
    this.free.push(obj)
    return true
  }

  destroy() {
    for (const obj of this.active) obj.destroy?.()
    for (const obj of this.free) obj.destroy?.()
    this.active.clear()
    this.free.length = 0
    this.destroyed = true
  }
}
