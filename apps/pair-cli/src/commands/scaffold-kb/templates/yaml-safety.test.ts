/**
 * Every generated YAML sink, parsed with a real YAML parser.
 *
 * The KB name is maintainer-supplied and lands in two YAML documents: the seed
 * skill's frontmatter (`description`, `author`) and the release workflow's `name`.
 * String-matching tests cannot tell a quoted scalar from a broken one — an
 * unquoted `author: Acme: Core KB` string-matches fine and makes a real parser
 * fail with "mapping values are not allowed here", which silently drops the KB's
 * only shipped skill in any agent runtime that parses SKILL.md.
 *
 * So this file asserts the only property that matters: the document PARSES and
 * the value round-trips byte-for-byte. New YAML sink ⇒ new case here.
 */
import { describe, it, expect } from 'vitest'
import { parse } from 'yaml'
import { resolveKbIdentity } from '../identity'
import { renderExampleSkill } from './seed-content'
import { renderReleaseWorkflow } from './release-workflow'

/**
 * Names that survive `validateKbName` (no newlines, no control characters) yet
 * are hostile to YAML if interpolated raw.
 */
const HOSTILE_NAMES = [
  'Acme: Core KB', // `:` — mapping-value error in an unquoted scalar
  'Acme "Core" KB', // `"` — closes a double-quoted scalar early
  'Acme\\KB', // `\` — invalid escape inside a double-quoted scalar
  "Acme's KB", // `'`
  'Acme #1 KB', // ` #` — comment start in an unquoted scalar
  '- Acme KB', // leading `-` — sequence item
  '@acme/kb', // leading `@` — reserved indicator
  '*acme', // leading `*` — alias indicator
  '{acme}', // flow mapping
  '[acme]', // flow sequence
  '%acme', // directive indicator
  'true', // would parse as a boolean, not a string
] as const

/** The frontmatter block of a SKILL.md, without the `---` fences. */
function frontmatterOf(skill: string): string {
  const lines = skill.split('\n')
  expect(lines[0]).toBe('---')
  const closing = lines.indexOf('---', 1)
  expect(closing).toBeGreaterThan(0)
  return lines.slice(1, closing).join('\n')
}

describe('generated YAML survives a hostile KB name', () => {
  for (const name of HOSTILE_NAMES) {
    const identity = resolveKbIdentity({ name, targetPath: '/tmp/kb' })

    it(`seed SKILL.md frontmatter parses for ${JSON.stringify(name)}`, () => {
      const frontmatter = parse(frontmatterOf(renderExampleSkill({ identity }))) as Record<
        string,
        unknown
      >

      expect(frontmatter['name']).toBe('example-skill')
      expect(frontmatter['author']).toBe(name)
      expect(frontmatter['description']).toBe(
        `Example skill shipped by the ${name} knowledge base. Replace it with your own.`,
      )
    })

    it(`release.yml parses for ${JSON.stringify(name)}`, () => {
      const workflow = parse(renderReleaseWorkflow({ identity })) as Record<string, unknown>

      expect(workflow['name']).toBe(`Release ${name}`)
      expect(workflow['on']).toEqual({ push: { tags: ['v*'] } })
    })
  }
})
