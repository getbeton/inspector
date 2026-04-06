/**
 * JSON output formatting for --json mode
 */

export interface JsonEnvelope<T> {
  data: T
  meta?: {
    total: number
    page: number
    page_size: number
    has_next: boolean
  }
}

export interface JsonError {
  error: {
    code: number
    message: string
  }
}

export function outputJson<T>(data: T, meta?: JsonEnvelope<T>['meta']): void {
  const envelope: JsonEnvelope<T> = { data }
  if (meta) envelope.meta = meta
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n')
}

export function outputError(code: number, message: string): never {
  const errorObj: JsonError = { error: { code, message } }
  process.stderr.write(JSON.stringify(errorObj, null, 2) + '\n')
  process.exit(code)
}
