// The scenario's Languages tab (spec 0435): switch Spanish on for the player material,
// translate it through the routed text model, review every item side by side, and keep the
// glossary. Nothing in Spanish is exported until a person has reviewed it.
import { useState } from 'react'
import { Link } from 'react-router'
import type { ItemRef, TranslationItemView } from '@shared/ipc'
import type { Scenario, SupportedLanguage } from '@shared/schemas'
import { Badge, Button } from '../../components/ui'
import { TranslationEditor } from '../../editors/translation/TranslationEditor'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { latestJob, trackJob, useJobsStore } from '../../state/jobs'
import { projectKey } from '../../state/project'
import { GlossaryEditor } from '../project-home/GlossaryEditor'

const LANG: SupportedLanguage = 'es'

const STATUS: Record<
  TranslationItemView['status'],
  { text: string; tone: 'ok' | 'warn' | 'neutral' | 'error' }
> = {
  missing: { text: 'Not translated', tone: 'neutral' },
  machine: { text: 'Needs review', tone: 'warn' },
  stale: { text: 'English changed', tone: 'error' },
  reviewed: { text: 'Reviewed', tone: 'ok' },
}

const refOf = (i: Pick<TranslationItemView, 'kind' | 'id'>): ItemRef =>
  (i.kind === 'doc' ? { kind: 'doc', id: i.id } : { kind: 'inject', id: i.id }) as ItemRef

function useTranslateJob(projectPath: string, scenarioId: string) {
  const job = useJobsStore((s) =>
    latestJob(
      s.jobs,
      (j) => j.kind === 'translate' && j.projectPath === projectPath && j.scenarioId === scenarioId,
    ),
  )
  return { job, running: job?.status === 'queued' || job?.status === 'running' }
}

function RouteNote(props: {
  route: { providerLabel: string; model?: string | undefined; cloud: boolean } | null
}) {
  const { route } = props
  if (!route)
    return (
      <p role="status">
        No text model is set. Choose one for Translation or Drafting in{' '}
        <Link to="/providers">Providers</Link>.
      </p>
    )
  return (
    <p>
      Translate sends the English text to <strong>{route.providerLabel}</strong>
      {route.model ? ` (${route.model})` : ''}.{' '}
      {route.cloud ? (
        <strong>This is a cloud provider: the text leaves this computer.</strong>
      ) : (
        'It runs on this computer.'
      )}
    </p>
  )
}

function Switches(props: { projectPath: string; scenario: Scenario; onChanged: () => void }) {
  const { scenario } = props
  const on = scenario.languages?.player.includes(LANG) ?? false
  const controller = scenario.languages?.controller ?? false
  const [error, setError] = useState('')
  const set = async (player: SupportedLanguage[], ctl: boolean) => {
    setError('')
    try {
      await call('translate:set-languages', {
        projectPath: props.projectPath,
        scenarioId: scenario.id,
        languages: { player, controller: ctl },
      })
      props.onChanged()
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <fieldset className="stack">
      <legend>Languages for players</legend>
      <label className="row">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => void set(e.target.checked ? [LANG] : [], controller)}
        />
        <span>Spanish (US) for the briefing, handouts and the injects players see</span>
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={controller}
          disabled={!on}
          onChange={(e) => void set(on ? [LANG] : [], e.target.checked)}
        />
        <span>Also translate controller material (handbook and controller handouts)</span>
      </label>
      <p className="muted">
        English stays the source of every scenario, and the app itself stays in English.
      </p>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

function ItemsTable(props: {
  items: TranslationItemView[]
  running: boolean
  onReview: (i: TranslationItemView) => void
  onRetranslate: (i: TranslationItemView) => void
}) {
  return (
    <table className="translation-items">
      <caption className="sr-only">Translated items and their review state</caption>
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Status</th>
          <th scope="col">Glossary hints</th>
          <th scope="col">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.items.map((i) => (
          <tr key={`${i.kind}:${i.id}`}>
            <th scope="row">{i.label}</th>
            <td>
              <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].text}</Badge>
            </td>
            <td>{i.flags.length ? i.flags.join('; ') : ''}</td>
            <td className="row">
              <Button size="sm" disabled={i.status === 'missing'} onClick={() => props.onReview(i)}>
                Review<span className="sr-only"> {i.label}</span>
              </Button>
              <Button size="sm" disabled={props.running} onClick={() => props.onRetranslate(i)}>
                Retranslate<span className="sr-only"> {i.label}</span>
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function LanguagesPanel(props: { projectPath: string; scenario: Scenario }) {
  const { projectPath, scenario } = props
  const enabled = scenario.languages?.player.includes(LANG) ?? false
  const q = useIpcQuery(
    'translate:status',
    { projectPath, scenarioId: scenario.id, lang: LANG },
    { enabled },
  )
  const { job, running } = useTranslateJob(projectPath, scenario.id)
  const [open, setOpen] = useState<ItemRef | null>(null)
  const [error, setError] = useState('')
  const refresh = () => void q.refetch()
  const base = { projectPath, scenarioId: scenario.id, lang: LANG }
  const items = q.data?.items ?? []

  const run = async (refs?: ItemRef[], retranslate?: boolean) => {
    setError('')
    try {
      const { jobId } = await call('translate:run', {
        ...base,
        ...(refs ? { items: refs } : {}),
        ...(retranslate ? { retranslate } : {}),
      })
      trackJob(jobId, { kind: 'translate', projectPath, scenarioId: scenario.id })
    } catch (e) {
      setError(errorText(e))
    }
  }
  const acceptAll = async () => {
    setError('')
    try {
      await call('translate:accept', base)
      refresh()
    } catch (e) {
      setError(errorText(e))
    }
  }
  const index = open ? items.findIndex((i) => i.kind === open.kind && i.id === open.id) : -1
  const next = index >= 0 ? items[index + 1] : undefined
  const unreviewed = items.filter((i) => i.status !== 'reviewed').length

  return (
    <div className="stack">
      <Switches projectPath={projectPath} scenario={scenario} onChanged={refresh} />
      {!enabled && <p className="muted">Switch on Spanish to translate the player material.</p>}
      {enabled && q.data && (
        <>
          <RouteNote route={q.data.route} />
          <div className="row">
            <Button
              variant="primary"
              disabled={running || !q.data.route}
              onClick={() => void run()}
            >
              {running ? 'Translating…' : 'Translate'}
            </Button>
            <Button disabled={running || unreviewed === 0} onClick={() => void acceptAll()}>
              Accept all in this scenario
            </Button>
            <span role="status">
              {running
                ? (job?.message ?? '')
                : unreviewed
                  ? `${unreviewed} of ${items.length} items need review before export`
                  : items.length
                    ? 'Every item is reviewed'
                    : ''}
            </span>
          </div>
          {job?.status === 'error' && (
            <p className="field__error" role="alert">
              {job.error}
            </p>
          )}
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <ItemsTable
            items={items}
            running={running}
            onReview={(i) => setOpen(refOf(i))}
            onRetranslate={(i) => void run([refOf(i)], true)}
          />
          {open && (
            <TranslationEditor
              key={`${open.kind}:${open.id}`}
              {...base}
              item={open}
              hasNext={!!next}
              onNext={() => next && setOpen(refOf(next))}
              onClose={() => setOpen(null)}
              onSaved={refresh}
            />
          )}
          <GlossaryEditor
            projectPath={projectPath}
            lang={LANG}
            entries={q.data.glossary}
            onSaved={refresh}
          />
          <p className="muted">
            Export Spanish from the{' '}
            <Link to={`/p/${projectKey(projectPath)}/scenarios/${scenario.id}/export`}>
              Export screen
            </Link>
            .
          </p>
        </>
      )}
    </div>
  )
}
