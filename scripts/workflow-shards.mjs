const words = ['github', 'azure-devops', 'linear', 'filesystem', 'dataset', 'installed'].map(word =>
  [...word].map(char => (/[a-z]/.test(char) ? `[${char}${char.toUpperCase()}]` : char)).join(''),
)

export const shardPatterns = [
  ...words.map(
    (word, index) =>
      `^${index ? `(?!.*(?:${words.slice(0, index).join('|')}))` : ''}(?=.*${word}).*$`,
  ),
  `^(?!.*(?:${words.join('|')})).*$`,
]

export const shardArguments = [
  ...words.map((word, index) => [
    `--test-name-pattern=${word}`,
    ...(index ? [`--test-skip-pattern=${words.slice(0, index).join('|')}`] : []),
  ]),
  [`--test-skip-pattern=${words.join('|')}`],
]

export async function runShards(run) {
  const results = await Promise.all(shardPatterns.map(run))
  return results.every(result => result === 0) ? 0 : 1
}

export function planWorkflowTests(files, knownSuite) {
  const board = 'pair-contracts/board-sync.test.mjs'
  if (
    !knownSuite ||
    files.length < 2 ||
    !files.includes(board) ||
    files.some(file => !file.endsWith('.test.mjs'))
  )
    return null
  return files.filter(file => file !== board)
}

export function isNodeTestCandidate(name) {
  return /(?:^|\/)test\/.*\.[cm]?[jt]s$|(?:^|\/)(?:test|test-.*|.*[.-]test)\.[cm]?[jt]s$/.test(name)
}
