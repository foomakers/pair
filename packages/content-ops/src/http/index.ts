/**
 * HTTP download utilities with resume capability
 */

export { downloadFile, type DownloadOptions, type DownloadErrorHandler } from './download-manager'

export {
  ProgressReporter,
  type ProgressWriter,
  type ProgressData,
  calculateSpeed,
  formatProgress,
} from './progress-reporter'

export {
  setupResumeContext,
  finalizeDownload,
  getContentLength,
  getPartialFilePath,
  hasPartialDownload,
  getPartialFileSize,
  cleanupPartialFile,
  shouldResume,
  type ResumeDecision,
  type DownloadContext,
} from './resume-manager'
