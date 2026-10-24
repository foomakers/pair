// card-id.mjs — US-572: the SHAPE every card id has on every tracker (`572`, `IN-01`, `01-01-001`, `ENG-123`):
// no separator, no `..`, no whitespace, nothing absolute, bounded; a leading `#` is dropped. Pure (no import).
// Which ids EXIST is the bound adapter's `parseCardRef`; this is only the guard a parser applies first.
export const CARD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

// → { id } or { error } — never throws, so pure parsers and adapters each raise their own typed error.
export function checkCardId(ref) {
  const id = String(ref ?? '').replace(/^#/, '')
  return CARD_ID_RE.test(id) && !id.includes('..') && id.length <= 120 ? { id } : { error: `${JSON.stringify(String(ref ?? ''))} is not a card id (no "/", "..", whitespace or absolute path)` }
}
