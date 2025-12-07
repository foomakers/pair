export interface ProgressData {
  bytesDownloaded: number
  totalBytes: number
  startTime: number
}

export interface ProgressWriter {
  write(data: string): void
}

/**
 * Calculate download speed in MB/s
 */
export function calculateSpeed(bytesDownloaded: number, startTime: number): number {
  const elapsed = Date.now() - startTime
  if (elapsed === 0) return 0
  const seconds = elapsed / 1000
  const megabytes = bytesDownloaded / (1024 * 1024)
  return megabytes / seconds
}

/**
 * Format progress data for display
 */
export function formatProgress(data: ProgressData, isTTY: boolean, label = 'Downloading'): string {
  const percentage = Math.round((data.bytesDownloaded / data.totalBytes) * 100)
  const downloadedMB = (data.bytesDownloaded / (1024 * 1024)).toFixed(1)
  const speed = calculateSpeed(data.bytesDownloaded, data.startTime)

  if (isTTY) {
    // TTY mode: inline progress with ANSI codes
    return `\r${label}... ${percentage}% (${downloadedMB} MB) @ ${speed.toFixed(1)} MB/s`
  } else {
    // Non-TTY mode: simple log lines
    return `${label}... ${percentage}% complete\n`
  }
}

/**
 * Progress reporter for HTTP downloads
 */
export class ProgressReporter {
  private totalBytes: number
  private bytesDownloaded = 0
  private startTime: number
  private isTTY: boolean
  private writer: ProgressWriter
  private lastUpdateTime = 0
  private readonly UPDATE_INTERVAL = 100 // 100ms = 10Hz
  private label: string

  constructor(totalBytes: number, isTTY: boolean, writer: ProgressWriter, label = 'Downloading') {
    this.totalBytes = totalBytes
    this.isTTY = isTTY
    this.writer = writer
    this.label = label
    this.startTime = Date.now()
  }

  /**
   * Update progress with new bytes downloaded
   * Throttles output to max 10Hz (100ms intervals)
   */
  update(bytesDownloaded: number): void {
    this.bytesDownloaded = bytesDownloaded

    const now = Date.now()
    if (now - this.lastUpdateTime < this.UPDATE_INTERVAL) {
      return // Throttle
    }

    this.lastUpdateTime = now

    const data: ProgressData = {
      bytesDownloaded: this.bytesDownloaded,
      totalBytes: this.totalBytes,
      startTime: this.startTime,
    }

    const formatted = formatProgress(data, this.isTTY, this.label)
    this.writer.write(formatted)
  }

  /**
   * Mark download as complete
   */
  complete(): void {
    const downloadedMB = (this.totalBytes / (1024 * 1024)).toFixed(1)
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1)

    if (this.isTTY) {
      this.writer.write(`\r✅ Download complete: ${downloadedMB} MB in ${elapsed}s\n`)
    } else {
      this.writer.write(`✅ Download complete: ${downloadedMB} MB in ${elapsed}s\n`)
    }
  }
}
