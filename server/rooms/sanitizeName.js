// Server-side displayName sanitization (ported from ez-ctf). Returns a clean
// 1-20 char string, or null when nothing usable remains (caller applies its
// default). Strips C0/C1 control chars + DEL so names can't smuggle ANSI
// escapes or zero-width junk into logs/HUD. Control-char class is built from
// char codes to keep this source free of literal control bytes.
const cc = String.fromCharCode
const CONTROL_CHARS = new RegExp(
  '[' + cc(0) + '-' + cc(31) + cc(127) + '-' + cc(159) + ']', 'g')

export default function sanitizeName(raw) {
  if (typeof raw !== 'string') return null
  const clean = raw
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, 20)
  return clean.length > 0 ? clean : null
}
