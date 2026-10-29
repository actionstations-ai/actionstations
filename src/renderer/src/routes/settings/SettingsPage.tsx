import { Link } from 'react-router'
import { useState, type ReactNode } from 'react'
import type { AppSettings, EmbeddingSettings, UiSettings } from '@shared/schemas'
import { Button, Field, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import './settings.css'
import { errorText } from '../../lib/errors'
import { PackCatalogsSection } from './PackCatalogsSection'
import { LocalToolsSection } from './LocalToolsSection'

const THEMES: { value: UiSettings['theme']; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const EMBEDDING_MODES: { value: EmbeddingSettings['mode']; label: string; hint: ReactNode }[] = [
  {
    value: 'hash',
    label: 'Keyword hashing (fastest, no model)',
    hint: 'Works offline with no download. Good enough for keyword-heavy plans; weaker on paraphrase.',
  },
  {
    value: 'local-onnx',
    label: 'Local model (on this computer)',
    hint: 'Runs a small embedding model locally. Downloads the model once; nothing leaves this machine.',
  },
  {
    value: 'provider',
    label: 'Configured provider',
    hint: (
      <>
        Uses the provider assigned to the <strong>Embeddings</strong> row in Providers → Routing
        (e.g. LM Studio, Ollama); a project&rsquo;s own routing overrides it.{' '}
        <Link to="/providers">Open Providers → Routing</Link>
      </>
    ),
  },
]

function useSaveSettings() {
  const mutation = useIpcMutation('settings:update', { invalidates: ['settings:get'] })
  return (patch: Parameters<typeof mutation.mutate>[0], what: string) =>
    mutation.mutate(patch, {
      onSuccess: () => toast.success(`${what} saved`),
      onError: (err) => toast.error(`Could not save ${what.toLowerCase()}`, err),
    })
}

function ProjectsFolderField({ current }: { current: string }) {
  const [value, setValue] = useState(current)
  const save = useSaveSettings()
  const browse = async () => {
    const picked = await call('dialog:open-directory', {
      title: 'Default folder for new projects',
      ...(value ? { defaultPath: value } : {}),
    })
    if (picked) {
      setValue(picked)
      save({ defaultProjectsDir: picked }, 'Default projects folder')
    }
  }
  return (
    <Field
      label="Default projects folder"
      hint="New projects are created here unless you choose another location. Updated each time you create a project."
    >
      {({ id, describedBy }) => (
        <div className="row">
          <input
            id={id}
            className="input mono"
            value={value}
            aria-describedby={describedBy}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button onClick={() => void browse()}>Choose…</Button>
          <Button
            disabled={value.trim() === current}
            onClick={() => save({ defaultProjectsDir: value.trim() }, 'Default projects folder')}
          >
            Save
          </Button>
        </div>
      )}
    </Field>
  )
}

function GeneralSection({ settings }: { settings: AppSettings }) {
  const save = useSaveSettings()
  return (
    <section className="card stack settings-section" aria-labelledby="general-heading">
      <h2 id="general-heading">General</h2>
      <Field label="Theme">
        {({ id }) => (
          <select
            id={id}
            className="select settings-select"
            value={settings.ui.theme}
            onChange={(e) =>
              save({ ui: { theme: e.target.value as UiSettings['theme'] } }, 'Theme')
            }
          >
            {THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label className="row">
        <input
          type="checkbox"
          checked={settings.ui.tips?.enabled ?? true}
          onChange={(e) => save({ ui: { tips: { enabled: e.target.checked } } }, 'Tip setting')}
        />
        <span>Show a tip on the Projects screen</span>
      </label>
      <ProjectsFolderField
        key={settings.defaultProjectsDir ?? ''}
        current={settings.defaultProjectsDir ?? ''}
      />
    </section>
  )
}

function EmbeddingsSection({ settings }: { settings: AppSettings }) {
  const save = useSaveSettings()
  const mode = settings.embeddings.mode
  const hint = EMBEDDING_MODES.find((m) => m.value === mode)?.hint
  return (
    <section className="card stack settings-section" aria-labelledby="embeddings-heading">
      <div>
        <h2 id="embeddings-heading">Embeddings</h2>
        <p className="muted">
          How source documents are indexed so generation can cite them. Applies to documents indexed
          after the change.
        </p>
      </div>
      <Field label="Embedding mode" hint={hint}>
        {({ id, describedBy }) => (
          <select
            id={id}
            className="select settings-select"
            value={mode}
            aria-describedby={describedBy}
            onChange={(e) =>
              save(
                { embeddings: { mode: e.target.value as EmbeddingSettings['mode'] } },
                'Embedding mode',
              )
            }
          >
            {EMBEDDING_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        )}
      </Field>
    </section>
  )
}

/** Follow-on jobs after a scenario finishes generating (#227). Off by default. */
export function GenerationSection({ settings }: { settings: AppSettings }) {
  const save = useSaveSettings()
  const on = settings.generation?.autoInjectsAndMedia ?? false
  return (
    <section className="card stack settings-section" aria-labelledby="generation-heading">
      <div>
        <h2 id="generation-heading">Generation</h2>
        <p className="muted">
          A generated scenario starts with its timeline of events. Injects and their media are
          separate steps you start from the scenario page, so you can review the timeline first.
        </p>
      </div>
      <label className="row">
        <input
          type="checkbox"
          checked={on}
          aria-describedby="auto-follow-hint"
          onChange={(e) =>
            save(
              { generation: { autoInjectsAndMedia: e.target.checked } },
              'Automatic injects and media',
            )
          }
        />
        <span>Write injects and render media automatically after generation</span>
      </label>
      <p id="auto-follow-hint" className="field__hint">
        Runs &ldquo;Write all injects&rdquo; and then &ldquo;Render all media&rdquo; as soon as a
        scenario finishes generating. Media rendering can take a while with AI image or video
        providers.
      </p>
    </section>
  )
}

export default function SettingsPage() {
  const settings = useIpcQuery('settings:get', undefined)
  return (
    <div className="page">
      <PageHeader
        eyebrow="Application"
        title="Settings"
        description="Preferences for this computer. They are stored in the app's data folder, never inside project folders."
        actions={
          <Link className="btn" to="/welcome">
            Run setup again
          </Link>
        }
      />
      {settings.isError && (
        <p className="field__error" role="alert">
          {errorText(settings.error)}
        </p>
      )}
      {settings.data && (
        <>
          <GeneralSection settings={settings.data} />
          <LocalToolsSection settings={settings.data} />
          <GenerationSection settings={settings.data} />
          <EmbeddingsSection settings={settings.data} />
          <PackCatalogsSection settings={settings.data} />
        </>
      )}
    </div>
  )
}
