import { checkDomainRatchet } from '../domain-ratchet.mjs'

try {
  const { errors, baselined, checked } = checkDomainRatchet()
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log(`Domain baseline passed on ${checked} files (${baselined} recorded findings).`)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 2
}
