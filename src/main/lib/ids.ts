import { ulid } from 'ulid'

export const newId = (): string => ulid()
export const nowIso = (): string => new Date().toISOString()
