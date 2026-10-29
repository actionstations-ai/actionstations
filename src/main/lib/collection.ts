// A folder of <id>.json records inside a project (redlines/, drills/). Ids are checked before
// they become file names, every write is atomic, and a file that no longer parses is skipped
// when listing rather than hiding the rest.
import { promises as fs } from 'node:fs'
import type { z } from 'zod'
import { SafeId } from '@shared/schemas'
import { AppError } from './errors'
import { exists, readJson, safeJoin, writeJsonAtomic } from './fs'

export interface Collection<T extends { id: string }> {
  list(root: string): Promise<T[]>
  get(root: string, id: string): Promise<T>
  save(root: string, record: T): Promise<T>
  remove(root: string, id: string): Promise<void>
}

export function makeCollection<S extends z.ZodType<{ id: string }>>(
  folder: string,
  schema: S,
): Collection<z.output<S>> {
  const fileOf = (root: string, id: string): string => {
    const parsed = SafeId.safeParse(id)
    if (!parsed.success) throw new AppError('VALIDATION', `Invalid id: ${id}`)
    return safeJoin(root, folder, `${parsed.data}.json`)
  }
  return {
    async list(root) {
      const dir = safeJoin(root, folder)
      if (!(await exists(dir))) return []
      const out: z.output<S>[] = []
      for (const name of (await fs.readdir(dir)).sort()) {
        if (!name.endsWith('.json')) continue
        try {
          out.push(await readJson(safeJoin(dir, name), schema))
        } catch {
          // A damaged file is left for the user to fix; the others still list.
        }
      }
      return out
    },
    get: (root, id) => readJson(fileOf(root, id), schema),
    async save(root, record) {
      const valid = schema.parse(record)
      await writeJsonAtomic(fileOf(root, valid.id), valid)
      return valid
    },
    async remove(root, id) {
      await fs.rm(fileOf(root, id), { force: true })
    },
  }
}
