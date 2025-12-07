import { ErrorLog, createFormatError } from '../observability'
import { FileSystemService, walkMarkdownFiles } from '../file-system'
import { cleanupFile } from '../file-system/file-operations'
import {
  ParsedLink,
  Replacement,
  generateNormalizationReplacements,
  generateExistenceCheckReplacements,
  processFileReplacement,
} from '../markdown'

type ProcessingResult = {
  allErrors: ErrorLog[]
  patchedLinks: number
  normalizedRelLinks: number
  normalizedFullLinks: number
}

export async function validatePathOps(
  fileService: FileSystemService,
  config: { datasetRoot: string; errorsPath: string; exclusionList: string[] },
) {
  const { datasetRoot, errorsPath } = config
  if (!datasetRoot) throw new Error('datasetRoot is required')

  const { mdFiles, datasetFolders } = await prepareData(datasetRoot, fileService)

  const processingResult = await processAllFiles(mdFiles, datasetFolders, config, fileService)

  const logs = await handleErrorsAndLogs(
    processingResult.allErrors,
    errorsPath,
    datasetRoot,
    fileService,
  )

  const finalLogs = generateFinalReport(logs, processingResult)

  return {
    logs: finalLogs,
    allErrors: processingResult.allErrors,
    patchedLinks: processingResult.patchedLinks,
    normalizedRelLinks: processingResult.normalizedRelLinks,
    normalizedFullLinks: processingResult.normalizedFullLinks,
  }
}

async function prepareData(datasetRoot: string, fileService: FileSystemService) {
  const mdFiles = await walkMarkdownFiles(datasetRoot, fileService)
  const datasetFolders = (await fileService.readdir(datasetRoot))
    .filter(e => e.isDirectory())
    .map(e => e.name)
  return { mdFiles, datasetFolders }
}

async function processAllFiles(
  mdFiles: string[],
  datasetFolders: string[],
  config: { datasetRoot: string; exclusionList: string[] },
  fileService: FileSystemService,
): Promise<ProcessingResult> {
  let allErrors: ErrorLog[] = []
  let patchedLinks = 0
  let normalizedRelLinks = 0
  let normalizedFullLinks = 0

  for (const file of mdFiles) {
    const result = await validateAndFixFileLinks(
      file,
      {
        docsFolders: datasetFolders,
        datasetRoot: config.datasetRoot,
        exclusionList: config.exclusionList,
      },
      fileService,
    )
    allErrors = allErrors.concat(result.errors)
    patchedLinks += result.patchedLinks
    normalizedRelLinks += result.normalizedRelLinks
    normalizedFullLinks += result.normalizedFullLinks
  }

  return { allErrors, patchedLinks, normalizedRelLinks, normalizedFullLinks }
}

async function handleErrorsAndLogs(
  allErrors: ErrorLog[],
  errorsPath: string,
  datasetRoot: string,
  fileService: FileSystemService,
): Promise<string[]> {
  const logs: string[] = []
  const formatError = createFormatError(datasetRoot)

  if (allErrors.length > 0) {
    await fileService.writeFile(errorsPath, allErrors.map(formatError).join('\n'))
    logs.push(`\nErrors found: ${allErrors.length}`)
    logs.push('Summary:')
    logs.push(`  BAD LINK FORMAT: ${allErrors.filter(e => e.type === 'BAD LINK FORMAT').length}`)
    logs.push(
      `  LINK TARGET NOT FOUND: ${
        allErrors.filter(e => e.type === 'LINK TARGET NOT FOUND').length
      }`,
    )
    logs.push(`\nAll errors have been written to: ${errorsPath}`)
  } else {
    await cleanupFile(errorsPath, fileService)
    logs.push('No previous errors file to delete or delete failed.')
    logs.push('All markdown links are valid.')
  }

  return logs
}

function generateFinalReport(logs: string[], processingResult: ProcessingResult): string[] {
  logs.push(`Patched links: ${processingResult.patchedLinks}`)
  logs.push(`Normalized relative links: ${processingResult.normalizedRelLinks}`)
  logs.push(`Normalized full links: ${processingResult.normalizedFullLinks}`)
  return logs
}

export async function validateAndFixFileLinks(
  file: string,
  config: { docsFolders: string[]; datasetRoot: string; exclusionList: string[] },
  fileService: FileSystemService,
) {
  const content = await fileService.readFile(file)
  const lines = content.split(/\r?\n/)
  const errors: ErrorLog[] = []

  // Check for bad link format errors
  checkForBadLinkFormat(lines, file, errors)

  const result = await processFileReplacement(
    file,
    (links, _content, lines) =>
      generateReplacements(links, _content, lines, { file, config, fileService, errors }),
    fileService,
  )

  const finalContent = result.content

  return {
    errors,
    patchedLinks: result.byKind?.['patched'] || 0,
    normalizedRelLinks: result.byKind?.['normalizedRel'] || 0,
    normalizedFullLinks: result.byKind?.['normalizedFull'] || 0,
    content: finalContent,
  }
}

/**
 * Check for bad link format errors in file lines
 */
function checkForBadLinkFormat(lines: string[], file: string, errors: ErrorLog[]): void {
  for (const [idx, line] of lines.entries()) {
    const badRefs = line.match(/:[^\s:]+\.md:/g)
    if (badRefs) {
      badRefs.forEach(() =>
        errors.push({ type: 'BAD LINK FORMAT', file, lineNumber: idx + 1, line }),
      )
    }
  }
}

type ReplacementsContext = {
  file: string
  config: { docsFolders: string[]; datasetRoot: string; exclusionList: string[] }
  fileService: FileSystemService
  errors: ErrorLog[]
}

/**
 * Generate replacements for file processing
 */
async function generateReplacements(
  links: ParsedLink[],
  _content: string,
  lines: string[],
  context: ReplacementsContext,
): Promise<Replacement[]> {
  const allReplacements: Replacement[] = []

  const normReplacements = await generateNormalizationReplacements(
    links,
    context.file,
    context.config,
    context.fileService,
  )
  allReplacements.push(...normReplacements)

  const existResult = await generateExistenceCheckReplacements({
    links,
    file: context.file,
    config: context.config,
    fileService: context.fileService,
    lines,
  })
  allReplacements.push(...existResult.replacements)
  context.errors.push(...existResult.errors)

  return allReplacements
}
