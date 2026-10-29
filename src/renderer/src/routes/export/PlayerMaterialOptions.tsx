// Export options for the player material (spec 0435): its language, the large-print copy and
// the override that prints a translation nobody has reviewed. The briefing, handouts and
// player injects are the material; the app itself stays in English.
import { Link } from 'react-router'
import { CHOICES, type usePlayerMaterial } from './use-player-material'
import { projectKey } from '../../state/project'

type Form = ReturnType<typeof usePlayerMaterial>

export function PlayerMaterialOptions(props: {
  form: Form
  disabled: boolean
  projectPath: string
  scenarioId: string
}) {
  const { form } = props
  const languagesUrl = `/p/${projectKey(props.projectPath)}/scenarios/${props.scenarioId}?tab=languages`
  return (
    <fieldset className="export-targets" disabled={props.disabled}>
      <legend className="export-targets__legend">Player material</legend>
      <p className="export-target__hint">
        The Player Briefing Packet, Player Handouts and Player Injects.
      </p>
      <div role="radiogroup" aria-label="Player material language" className="export-radios">
        {CHOICES.map((c) => {
          const blocked = c.id !== 'en' && !form.spanishOn
          return (
            <label key={c.id} className="export-target">
              <input
                type="radio"
                name="player-language"
                checked={form.choice === c.id}
                disabled={blocked}
                onChange={() => form.setChoice(c.id)}
              />
              <span className="export-target__text">
                <span className="export-target__label">{c.label}</span>
              </span>
            </label>
          )
        })}
      </div>
      {!form.spanishOn && (
        <p className="export-target__hint">
          Spanish is off for this scenario. Switch it on in <Link to={languagesUrl}>Languages</Link>
          .
        </p>
      )}
      {form.spanish && form.unreviewed.length > 0 && (
        <div role="alert" className="export-warning">
          <p>
            {form.unreviewed.length} translated item{form.unreviewed.length === 1 ? ' is' : 's are'}{' '}
            not reviewed, so the export will be refused. Review them in{' '}
            <Link to={languagesUrl}>Languages</Link>.
          </p>
          <label className="export-target">
            <input
              type="checkbox"
              checked={form.allowUnreviewed}
              onChange={(e) => form.setAllowUnreviewed(e.target.checked)}
            />
            <span className="export-target__text">
              <span className="export-target__label">Export unreviewed translation</span>
              <span className="export-target__hint">
                Every page is stamped &ldquo;Traducción automática sin revisar / Unreviewed machine
                translation&rdquo;.
              </span>
            </span>
          </label>
        </div>
      )}
      {form.spanish && form.controllerOn && (
        <label className="export-target">
          <input
            type="checkbox"
            checked={form.controller}
            onChange={(e) => form.setController(e.target.checked)}
          />
          <span className="export-target__text">
            <span className="export-target__label">
              Also write the controller material in Spanish
            </span>
            <span className="export-target__hint">
              Handbook and controller handouts, to facilitator/es/. Never given to players.
            </span>
          </span>
        </label>
      )}
      <label className="export-target">
        <input
          type="checkbox"
          checked={form.largePrint}
          onChange={(e) => form.setLargePrint(e.target.checked)}
        />
        <span className="export-target__text">
          <span className="export-target__label">Also write a large-print copy</span>
          <span className="export-target__hint">
            18 point text, single column, each picture followed by its words.
          </span>
        </span>
      </label>
    </fieldset>
  )
}
