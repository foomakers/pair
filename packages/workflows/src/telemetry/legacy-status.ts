function migrateStepLine(line: string): string {
  if (line === '') return line
  try {
    const record = JSON.parse(line) as { type?: unknown; status?: unknown } | null
    return record?.type === 'step' && record.status === 'needs-human'
      ? JSON.stringify({ ...record, status: 'needs-decision' })
      : line
  } catch {
    // An unreadable telemetry line must not prevent resuming the workflow.
    return line
  }
}

export function migrateTelemetryStatuses(text: string): string {
  return text.split('\n').map(migrateStepLine).join('\n')
}
