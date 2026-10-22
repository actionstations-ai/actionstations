// Reusable inject library: userData/library/<id>.json. An item is an inject's text content
// (type, title, fields, instructor note) saved under a name, insertable into any scenario row.
import { promises as fs } from 'node:fs'
import { LibraryItem } from '@shared/ipc/injects'
import { Inject, SafeId } from '@shared/schemas'
import { AppError } from '../../lib/errors'
import { emit } from '../../lib/events'
import { ensureDir, readJson, safeJoin, writeJsonAtomic } from '../../lib/fs'
import { newId, nowIso } from '../../lib/ids'
import { userDataPath } from '../../lib/paths'
import { getScenario, saveInject } from '../../scenario/store'
import { linkRow } from './store'
import { defaultDelivery } from './type-map'

export const libraryDir = (): string => userDataPath('library')

const itemFile = (id: string): string => {
  if (!SafeId.safeParse(id).success) throw new AppError('VALIDATION', `Invalid library id: ${id}`)
  return safeJoin(libraryDir(), `${id}.json`)
}

export async function listLibrary(): Promise<LibraryItem[]> {
  const dir = libraryDir()
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) =>
    f.endsWith('.json'),
  )
  const items: LibraryItem[] = []
  for (const f of files) {
    const parsed = LibraryItem.safeParse(JSON.parse(await fs.readFile(safeJoin(dir, f), 'utf8')))
    if (parsed.success) items.push(parsed.data)
  }
  return items.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export async function saveToLibrary(inject: Inject, name: string): Promise<LibraryItem> {
  await ensureDir(libraryDir())
  const item: LibraryItem = {
    id: newId(),
    name: name.trim(),
    type: inject.type,
    title: inject.title,
    fields: inject.fields,
    ...(inject.instructorNote ? { instructorNote: inject.instructorNote } : {}),
    savedAt: nowIso(),
  }
  await writeJsonAtomic(itemFile(item.id), item)
  emit('project:changed', { path: '', what: 'library' })
  return item
}

export async function deleteFromLibrary(id: string): Promise<void> {
  await fs.rm(itemFile(id), { force: true })
  emit('project:changed', { path: '', what: 'library' })
}

/** Create an inject for `rowId` from a library item (a user save; the row is linked). */
export async function insertFromLibrary(
  root: string,
  scenarioId: string,
  libraryId: string,
  rowId: string,
): Promise<Inject> {
  const item = await readJson(itemFile(libraryId), LibraryItem)
  const s = await getScenario(root, scenarioId)
  const row = s.msel.find((r) => r.id === rowId)
  if (!row) throw new AppError('NOT_FOUND', `No MSEL row ${rowId} in scenario ${scenarioId}`)
  if (row.injectId)
    throw new AppError('CONFLICT', `Row ${rowId} already has inject ${row.injectId}`)
  const inject = Inject.parse({
    id: newId(),
    mselRowId: rowId,
    type: item.type,
    title: item.title,
    deliveryMode: defaultDelivery(item.type),
    fields: item.fields,
    ...(item.instructorNote ? { instructorNote: item.instructorNote } : {}),
  })
  const saved = await saveInject(root, scenarioId, inject, {
    by: 'user',
    note: `inserted from library "${item.name}"`,
  })
  await linkRow(root, scenarioId, rowId, saved.id, { by: 'user' })
  return saved
}
