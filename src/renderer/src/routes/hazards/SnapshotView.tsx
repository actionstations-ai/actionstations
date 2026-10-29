// One snapshot, read-only (#439 FR-13): the result of each source in words, then the records as
// tables with headers. Maps are not needed to use any of it.
import type { HazardSnapshot } from '@shared/schemas'
import { Badge } from '../../components/ui'
import { SOURCE_LABEL, STATUS_TEXT, STATUS_TONE, formatWhen } from './hazard-view'

function Results({ s }: { s: HazardSnapshot }) {
  return (
    <table className="table">
      <caption className="sr-only">Result of each source</caption>
      <thead>
        <tr>
          <th scope="col">Source</th>
          <th scope="col">Result</th>
          <th scope="col">Detail</th>
        </tr>
      </thead>
      <tbody>
        {s.sources.map((r, i) => (
          <tr key={`${r.id}-${i}`}>
            <th scope="row">{SOURCE_LABEL[r.id]}</th>
            <td>
              <Badge tone={STATUS_TONE[r.status]}>{STATUS_TEXT[r.status]}</Badge>
            </td>
            <td>{r.error ?? r.attribution}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Section(props: { title: string; empty: boolean; children: React.ReactNode }) {
  if (props.empty) return null
  return (
    <section className="stack" aria-label={props.title}>
      <h3>{props.title}</h3>
      {props.children}
    </section>
  )
}

export function SnapshotView({ snapshot: s }: { snapshot: HazardSnapshot }) {
  const quakes = [...s.earthquakes.recent, ...s.earthquakes.historical]
  return (
    <div className="stack" data-testid="hazard-snapshot">
      <p className="muted">
        Fetched {formatWhen(s.fetchedAt)} for {s.request.lat}, {s.request.lon} (rounded to{' '}
        {s.request.precision} degrees).
      </p>
      <Results s={s} />
      <Section title="Active weather alerts" empty={!s.alerts.length}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Severity</th>
              <th scope="col">Headline</th>
              <th scope="col">Area</th>
            </tr>
          </thead>
          <tbody>
            {s.alerts.map((a, i) => (
              <tr key={i}>
                <th scope="row">{a.event}</th>
                <td>{a.severity}</td>
                <td>{a.headline}</td>
                <td>{a.areaDesc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Forecast" empty={!s.forecast.length}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Forecast</th>
              <th scope="col">Temperature</th>
              <th scope="col">Wind</th>
            </tr>
          </thead>
          <tbody>
            {s.forecast.map((f, i) => (
              <tr key={i}>
                <th scope="row">{f.name}</th>
                <td>{f.shortForecast}</td>
                <td>{f.temperature !== undefined ? `${f.temperature} ${f.unit ?? ''}` : ''}</td>
                <td>{f.windSpeed ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Earthquakes" empty={!quakes.length}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Magnitude</th>
              <th scope="col">Place</th>
              <th scope="col">Distance (km)</th>
            </tr>
          </thead>
          <tbody>
            {quakes.map((q, i) => (
              <tr key={`${q.id}-${i}`}>
                <td>{q.time.slice(0, 10)}</td>
                <th scope="row">{q.mag}</th>
                <td>{q.place}</td>
                <td>{q.distanceKm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Fire detections" empty={!s.fires}>
        <p>
          {s.fires?.count ?? 0} detection(s) in the last {s.fires?.days} day(s)
          {s.fires?.nearestKm !== undefined ? `; the nearest is ${s.fires.nearestKm} km away` : ''}.
        </p>
      </Section>
      <Section title="Disaster declarations" empty={!s.declarations.length}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Number</th>
              <th scope="col">Type</th>
              <th scope="col">Title</th>
            </tr>
          </thead>
          <tbody>
            {s.declarations.slice(0, 50).map((d) => (
              <tr key={d.disasterNumber}>
                <td>{d.declarationDate.slice(0, 10)}</td>
                <th scope="row">
                  {d.declarationType}-{d.disasterNumber}
                </th>
                <td>{d.incidentType}</td>
                <td>{d.declarationTitle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {s.infrastructure.map((layer) => (
        <Section key={layer.layer} title={`Infrastructure: ${layer.layer}`} empty={false}>
          <p className="muted">Source: {layer.source}</p>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Distance (km)</th>
              </tr>
            </thead>
            <tbody>
              {layer.features.slice(0, 50).map((f, i) => (
                <tr key={i}>
                  <th scope="row">{f.name}</th>
                  <td>{f.type ?? ''}</td>
                  <td>{f.distanceKm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ))}
    </div>
  )
}
