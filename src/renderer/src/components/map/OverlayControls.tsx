// Controls for map overlays (#652, NFR-3): a list of layers with a checkbox each, a legend whose
// swatches carry a line pattern as well as a colour, a time slider with step buttons, and the
// overlay data as a table. Everything is a native control, so the keyboard reaches all of it:
// Tab moves between layers, Space toggles one, the arrow keys move the slider.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { legendEntries, type LegendEntry, type LegendItem } from '@shared/maps/overlays/legend'
import {
  featureCount,
  overlayTableRows,
  overlaySummary,
  TABLE_COLUMNS,
} from '@shared/maps/overlays/figure'
import { formatStep } from '@shared/maps/overlays/time'
import { Button } from '../ui'
import type { OverlayState } from './overlay-state'

function Swatch({ entry, item }: { entry: LegendEntry; item: LegendItem }) {
  const dash = item.dash.length ? item.dash.map((d) => d * 2).join(' ') : undefined
  return (
    <svg className="overlay-swatch" width="24" height="14" viewBox="0 0 24 14" aria-hidden>
      {entry.swatch === 'line' ? (
        <path
          d="M1,7 L23,7"
          stroke={item.color}
          strokeWidth="2"
          strokeDasharray={dash}
          fill="none"
        />
      ) : entry.swatch === 'point' ? (
        <circle
          cx="12"
          cy="7"
          r="5"
          fill={item.color}
          fillOpacity="0.5"
          stroke={item.color}
          strokeWidth="2"
        />
      ) : (
        <rect
          x="1"
          y="1"
          width="22"
          height="12"
          fill={item.color}
          fillOpacity={entry.swatch === 'ramp' ? 1 : 0.4}
          stroke={item.color}
          strokeWidth="2"
          strokeDasharray={dash}
        />
      )}
    </svg>
  )
}

function LayerList({ state }: { state: OverlayState }) {
  return (
    <fieldset className="overlay-layers">
      <legend>Map layers</legend>
      <ul>
        {state.layers.map((layer) => (
          <li key={layer.id}>
            <label>
              <input
                type="checkbox"
                checked={state.on.has(layer.id)}
                onChange={() => state.toggle(layer.id)}
              />{' '}
              {layer.title} <span className="muted">({featureCount(layer)})</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}

function OverlayLegend({ entries }: { entries: LegendEntry[] }) {
  if (!entries.length) return null
  return (
    <ul className="overlay-legend" aria-label="Overlay legend">
      {entries.map((e) => (
        <li key={e.layerId}>
          <b>{e.label}</b>
          {e.note ? <span className="muted"> {e.note}</span> : null}
          <ul className={e.swatch === 'ramp' ? 'overlay-legend__ramp' : undefined}>
            {e.items.map((i) => (
              <li key={i.label + i.color}>
                <Swatch entry={e} item={i} /> {i.label}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function TimeSlider({ state }: { state: OverlayState }) {
  const { steps, index } = state
  if (steps.length < 2) return null
  const text = state.at === null ? 'All times' : formatStep(steps[index]!)
  return (
    <div className="overlay-time" role="group" aria-label="Time">
      <Button
        size="sm"
        aria-label="Earlier"
        disabled={state.allTimes || index === 0}
        onClick={() => state.setIndex(index - 1)}
      >
        <ChevronLeft size={14} aria-hidden />
      </Button>
      <input
        type="range"
        aria-label="Time"
        min={0}
        max={steps.length - 1}
        step={1}
        value={index}
        disabled={state.allTimes}
        aria-valuetext={text}
        onChange={(e) => state.setIndex(Number(e.target.value))}
      />
      <Button
        size="sm"
        aria-label="Later"
        disabled={state.allTimes || index === steps.length - 1}
        onClick={() => state.setIndex(index + 1)}
      >
        <ChevronRight size={14} aria-hidden />
      </Button>
      <output className="overlay-time__text" aria-live="polite">
        {text}
      </output>
      <label className="overlay-time__all">
        <input
          type="checkbox"
          checked={state.allTimes}
          onChange={(e) => state.setAllTimes(e.target.checked)}
        />{' '}
        Show all times
      </label>
    </div>
  )
}

function OverlayData({ state, title }: { state: OverlayState; title: string }) {
  const rows = overlayTableRows(state.shown)
  return (
    <details className="overlay-data">
      <summary>Overlay data ({rows.length})</summary>
      <p className="muted">{overlaySummary(title, state.layers, state.shown, state.at, 0)}</p>
      {rows.length ? (
        <table className="map-locations__table">
          <caption className="sr-only">Overlay data at the time shown</caption>
          <thead>
            <tr>
              {TABLE_COLUMNS.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Nothing is in force at this time.</p>
      )}
    </details>
  )
}

export function OverlayControls({ state, title }: { state: OverlayState; title: string }) {
  if (!state.layers.length) return null
  return (
    <section className="overlay-controls" aria-label="Map overlays">
      <LayerList state={state} />
      <TimeSlider state={state} />
      <OverlayLegend entries={legendEntries(state.shown.filter((l) => featureCount(l) > 0))} />
      <OverlayData state={state} title={title} />
    </section>
  )
}
