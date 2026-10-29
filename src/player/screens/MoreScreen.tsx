import { useState } from 'react'
import { PROTOCOL_VERSION } from '../../shared/live/protocol'
import { canVibrate, playCue, unlockSound } from '../app/a11y'
import type { Prefs, TextSize, Theme } from '../app/prefs'
import type { PlayerSession } from '../app/session'
import { useStore, type Store } from '../app/store'
import { STRINGS } from '../app/strings'

type View = 'menu' | 'settings' | 'about'

interface Entry {
  id: string
  label: string
  /** When set the entry is shown disabled with this one-line reason (FR-6). */
  why?: string
  onOpen?: () => void
}

/** Votes, hot wash, surveys and evaluate (all disabled until their specs land), Settings, About. */
export function MoreScreen({
  session,
  prefsStore,
  bundleVersion,
}: {
  session: PlayerSession
  prefsStore: Store<Prefs>
  bundleVersion: string
}) {
  const [view, setView] = useState<View>('menu')
  const info = useStore(session.store, (s) => s.info)
  const seat = useStore(session.store, (s) => s.seat)
  const features = info?.features
  const reason = (on: boolean | undefined) =>
    on === false ? STRINGS.more.featureOff : STRINGS.more.laterUpdate
  const entries: Entry[] = [
    { id: 'votes', label: STRINGS.more.votes, why: reason(features?.votes) },
    { id: 'hotwash', label: STRINGS.more.hotwash, why: reason(features?.hotwash) },
    { id: 'surveys', label: STRINGS.more.surveys, why: reason(features?.surveys) },
    {
      id: 'evaluate',
      label: STRINGS.more.evaluate,
      why: seat?.kind !== 'evaluator' ? STRINGS.more.evaluatorsOnly : reason(features?.eval),
    },
    { id: 'settings', label: STRINGS.more.settings, onOpen: () => setView('settings') },
    { id: 'about', label: STRINGS.more.about, onOpen: () => setView('about') },
  ]

  if (view === 'settings')
    return <SettingsScreen prefsStore={prefsStore} onBack={() => setView('menu')} />
  if (view === 'about')
    return (
      <AboutScreen session={session} bundleVersion={bundleVersion} onBack={() => setView('menu')} />
    )

  return (
    <section className="screen" aria-labelledby="more-heading" data-screen="more">
      <div className="screen__head">
        <h1 id="more-heading">{STRINGS.more.heading}</h1>
      </div>
      {seat?.role ? <p className="muted">{STRINGS.more.seatInfo(seat.role.name)}</p> : null}
      <ul className="menu">
        {entries.map((e) => (
          <li key={e.id} className="menu__item">
            <button
              type="button"
              className="menu__btn"
              aria-disabled={e.why ? 'true' : undefined}
              aria-describedby={e.why ? `more-${e.id}-why` : undefined}
              onClick={() => e.onOpen?.()}
            >
              <span className="menu__label">{e.label}</span>
              {e.why ? (
                <span id={`more-${e.id}-why`} className="menu__why">
                  {e.why}
                </span>
              ) : (
                <span className="menu__chevron" aria-hidden="true">
                  ›
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="btn btn--quiet back" onClick={onBack}>
      <span aria-hidden="true">‹ </span>
      {STRINGS.more.back}
    </button>
  )
}

export function SettingsScreen({
  prefsStore,
  onBack,
}: {
  prefsStore: Store<Prefs>
  onBack: () => void
}) {
  const prefs = useStore(prefsStore, (p) => p)
  const set = (patch: Partial<Prefs>) => prefsStore.set(patch)
  const vibrates = canVibrate()
  return (
    <section className="screen" aria-labelledby="settings-heading" data-screen="settings">
      <BackButton onBack={onBack} />
      <div className="screen__head">
        <h1 id="settings-heading">{STRINGS.settings.heading}</h1>
      </div>
      <fieldset className="choice">
        <legend>{STRINGS.settings.theme}</legend>
        {(['system', 'light', 'dark'] as Theme[]).map((t) => (
          <label key={t} className="choice__option">
            <input
              type="radio"
              name="theme"
              value={t}
              checked={prefs.theme === t}
              onChange={() => set({ theme: t })}
            />
            <span>
              {t === 'system'
                ? STRINGS.settings.themeSystem
                : t === 'light'
                  ? STRINGS.settings.themeLight
                  : STRINGS.settings.themeDark}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="choice">
        <legend>{STRINGS.settings.textSize}</legend>
        {(['normal', 'large'] as TextSize[]).map((t) => (
          <label key={t} className="choice__option">
            <input
              type="radio"
              name="text-size"
              value={t}
              checked={prefs.textSize === t}
              onChange={() => set({ textSize: t })}
            />
            <span>{t === 'normal' ? STRINGS.settings.textNormal : STRINGS.settings.textLarge}</span>
          </label>
        ))}
      </fieldset>
      <div className="switch-row">
        <span id="sound-label">{STRINGS.settings.sound}</span>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.sound}
          aria-labelledby="sound-label"
          className="switch"
          onClick={() => {
            const next = !prefs.sound
            if (next) {
              unlockSound()
              playCue()
            }
            set({ sound: next })
          }}
        >
          <span className="switch__knob" aria-hidden="true" />
          <span className="switch__text">
            {prefs.sound ? STRINGS.settings.on : STRINGS.settings.off}
          </span>
        </button>
      </div>
      <div className="switch-row">
        <span id="vibration-label">
          {STRINGS.settings.vibration}
          {vibrates ? null : (
            <span className="field__hint"> {STRINGS.settings.vibrationUnsupported}</span>
          )}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={prefs.vibration}
          aria-labelledby="vibration-label"
          className="switch"
          disabled={!vibrates}
          onClick={() => set({ vibration: !prefs.vibration })}
        >
          <span className="switch__knob" aria-hidden="true" />
          <span className="switch__text">
            {prefs.vibration ? STRINGS.settings.on : STRINGS.settings.off}
          </span>
        </button>
      </div>
    </section>
  )
}

export function AboutScreen({
  session,
  bundleVersion,
  onBack,
}: {
  session: PlayerSession
  bundleVersion: string
  onBack: () => void
}) {
  const info = useStore(session.store, (s) => s.info)
  const transport = useStore(session.store, (s) => s.transport)
  const clientId = useStore(session.store, (s) => s.clientId)
  return (
    <section className="screen" aria-labelledby="about-heading" data-screen="about">
      <BackButton onBack={onBack} />
      <div className="screen__head">
        <h1 id="about-heading">{STRINGS.about.heading}</h1>
      </div>
      <dl className="facts">
        <dt>{STRINGS.about.page}</dt>
        <dd>{bundleVersion}</dd>
        <dt>{STRINGS.about.protocol}</dt>
        <dd>{PROTOCOL_VERSION}</dd>
        <dt>{STRINGS.about.transport}</dt>
        <dd>{transport === 'fetch' ? STRINGS.about.transportFetch : STRINGS.about.transportWs}</dd>
        <dt>{STRINGS.about.device}</dt>
        <dd>
          <code>{clientId}</code>
          <span className="field__hint"> {STRINGS.about.deviceHint}</span>
        </dd>
      </dl>
      <h2 className="h3">{STRINGS.about.recorded}</h2>
      <p>
        {info?.attribution === 'named' ? STRINGS.about.recordedNamed : STRINGS.about.recordedRole}
      </p>
      <p>{STRINGS.about.notRecorded}</p>
      <div className="about__forget">
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            session.forgetDevice()
            location.reload()
          }}
        >
          {STRINGS.about.forget}
        </button>
        <p className="field__hint">{STRINGS.about.forgetHint}</p>
      </div>
    </section>
  )
}
