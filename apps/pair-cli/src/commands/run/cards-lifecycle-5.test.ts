import { it } from 'vitest'
import { preparedCases, preparedHandlerCase } from './cards-lifecycle-lib'

it.each(preparedCases.filter((_, i) => i % 2 === 1))(
  'G5-handler-$id: prepared partitions survive handler wiring',
  preparedHandlerCase,
)
