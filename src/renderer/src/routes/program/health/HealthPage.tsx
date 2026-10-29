// /program/health (#438): which Core Capabilities and plan sections have been exercised, when,
// which corrective actions are open or overdue, and what has never been tested. Tables first;
// the one chart has a table twin. Computed in main from the program's own files; this page never
// opens a project folder.
import { useMemo, useState } from 'react'
import { documentKey } from '@shared/program/health-sections'
import { Button, EmptyState } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { call } from '../../../lib/api'
import { errorText } from '../../../lib/errors'
import { useIpcQuery } from '../../../lib/query'
import { ProgramFrame, type ProgramContext } from '../ProgramFrame'
import { ActionsPanel } from './ActionsPanel'
import { CapabilityMatrix } from './CapabilityMatrix'
import { FiltersBar, type FilterOptions } from './FiltersBar'
import { HealthExport } from './HealthExport'
import { NeverTestedPanel, TimelinePanel } from './NeverTestedPanel'
import { SectionsTable } from './SectionsTable'
import { FreshnessLine, TotalsRow } from './Summary'
import { useHealthFilter } from './use-health-filter'
import './health.css'

function useFilterOptions(ctx: ProgramContext): FilterOptions {
  const snaps = useIpcQuery('program:snapshots', { programPath: ctx.programPath })
  const { startYear, years } = ctx.summary.program.cycle
  return useMemo(() => {
    const docs = new Map<string, string>()
    for (const s of snaps.data ?? []) for (const d of s.documents) docs.set(documentKey(d), d.title)
    return {
      projects: ctx.summary.program.projects.map((p) => ({ id: p.projectId, name: p.name })),
      years: Array.from({ length: years }, (_, i) => startYear + i),
      documents: [...docs].map(([key, title]) => ({ key, title })),
    }
  }, [snaps.data, ctx.summary.program.projects, startYear, years])
}

function Unmapped({ count }: { count: number }) {
  if (!count) return null
  return (
    <p className="program-lock" role="status">
      {count} {count === 1 ? 'exercise predates' : 'exercises predate'} Core Capability mapping.
      They appear in the timeline and the plan sections, not in the capability table. Open them and
      run "Map objectives to capabilities" to include them.
    </p>
  )
}

function HealthBody({ ctx }: { ctx: ProgramContext }) {
  const { choice, filter, setChoice } = useHealthFilter()
  const [exporting, setExporting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const options = useFilterOptions(ctx)
  const query = useIpcQuery('program:health', { programPath: ctx.programPath, filter })
  const refresh = async () => {
    setRefreshing(true)
    try {
      await call('program:refresh', { programPath: ctx.programPath })
    } catch (e) {
      toast.error('Could not refresh the projects', e)
    } finally {
      setRefreshing(false)
    }
  }
  const health = query.data
  return (
    <div className="stack">
      <FiltersBar choice={choice} options={options} onChange={setChoice} />
      {query.error && (
        <p className="field__error" role="alert">
          {errorText(query.error)}
        </p>
      )}
      {!health && !query.error && <p role="status">Loading…</p>}
      {health && (
        <>
          <FreshnessLine
            freshness={health.freshness}
            busy={refreshing}
            onRefresh={() => void refresh()}
          />
          {health.freshness.length === 0 ? (
            <EmptyState
              title="No projects are linked to this program"
              body="Link a project on the Overview page. The report is built from the snapshots the program keeps of its projects."
            />
          ) : (
            <>
              <TotalsRow totals={health.totals} />
              <Unmapped count={health.unmappedExercises} />
              <CapabilityMatrix health={health} ctx={ctx} />
              <SectionsTable health={health} ctx={ctx} />
              <ActionsPanel health={health} />
              <NeverTestedPanel health={health} />
              <TimelinePanel health={health} />
            </>
          )}
        </>
      )}
      <div className="row">
        <Button onClick={() => setExporting(true)} disabled={!health}>
          Export report…
        </Button>
      </div>
      {exporting && (
        <HealthExport
          programPath={ctx.programPath}
          filter={filter}
          onClose={() => setExporting(false)}
        />
      )}
    </div>
  )
}

export default function HealthPage() {
  return (
    <ProgramFrame
      title="Program health"
      description="Which capabilities and plan sections have been exercised, and when. Counts and dates only; this is not a score."
    >
      {(ctx) => <HealthBody ctx={ctx} />}
    </ProgramFrame>
  )
}
