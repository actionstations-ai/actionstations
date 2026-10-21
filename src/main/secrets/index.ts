// Secret storage (#21): API keys encrypted with Electron safeStorage in userData/secrets.json.
// Never in project folders, settings.json, or logs.
import { AppError } from '../lib/errors'

export async function getSecret(_providerId: string): Promise<string | undefined> {
  throw new AppError('NOT_IMPLEMENTED', 'Secrets land with #21')
}
export async function setSecret(_providerId: string, _value: string | null): Promise<void> {
  throw new AppError('NOT_IMPLEMENTED', 'Secrets land with #21')
}
export async function hasSecret(_providerId: string): Promise<boolean> {
  throw new AppError('NOT_IMPLEMENTED', 'Secrets land with #21')
}
