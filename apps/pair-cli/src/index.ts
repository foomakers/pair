import { join } from 'path'
import { fileSystemService } from '@pair/content-ops'

const pkg = JSON.parse(fileSystemService.readFileSync(join(__dirname, '..', 'package.json')))

export const version = pkg.version
