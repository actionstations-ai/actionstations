import { useState } from 'react'
import type { AppSettings, EmbeddingSettings, UiSettings } from '@shared/schemas'
import { Button, Field, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import './settings.css'

const THEMES: { value: UiSettings['theme']; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const EMBEDDING_MODES: { value: EmbeddingSettings['mode']; label: string; hint: string }[] = [
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
    hint: 'Uses an embeddings endpoint from one of your configured providers (e.g. LM Studio, Ollama).',
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

export default function SettingsPage() {
  const settings = useIpcQuery('settings:get', undefined)
  return (
    <div className="page">
      <PageHeader
        eyebrow="Application"
        title="Settings"
        description="Preferences for this computer. They are stored in the app's data folder, never inside project folders."
      />
      {settings.isError && <p className="field__error">{settings.error.message}</p>}
      {settings.data && (
        <>
          <GeneralSection settings={settings.data} />
          <EmbeddingsSection settings={settings.data} />
        </>
      )}
    </div>
  )
}
