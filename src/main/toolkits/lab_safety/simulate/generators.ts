// The lab safety simulations as case-data generators (spec 0466 FR-8, spec 0448 FR-10). Each is a
// pure function of its parameters; the framework writes the provenance (origin simulated, no
// retrieval date) and every dataset label says simulated as well. Datasets that metrics read are
// stored the way the flooding toolkit stores them: a GeoJSON collection with no features and the
// rows under `series` or `events`. People, items and rooms are fictional.
import type { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import { AccessParams, BackupParams, runAccessLog, runBackupStatus } from './access'
import { AlarmParams, runAlarm } from './alarm'
import { FollowupParams, runFollowup } from './followup'
import { CAUSE_TEXT, InventoryParams, runInventory } from './inventory'

const MARK = 'EXERCISE ONLY. Simulated data.'

const metricFile = (key: 'series' | 'events', rows: unknown[]) => ({
  type: 'FeatureCollection',
  features: [],
  [key]: rows,
})

const rangeOf = (times: string[]) => ({ start: times[0]!, end: times[times.length - 1]! })

const alarmGenerator: SimulatedGenerator<z.output<typeof AlarmParams>> = {
  id: 'lab-alarm-event',
  label: 'Simulated freezer alarm (failure, warming curve, alarm, call-out, samples at risk)',
  params: AlarmParams,
  generate(p) {
    const run = runAlarm(p)
    const times = run.points.map((x) => x.time)
    const events: { id: string; time: string; area: string; kind: string; attrs: object }[] =
      run.events.map((e, i) => ({
        id: `${e.kind}-${i + 1}`,
        time: e.time,
        area: p.unit,
        kind: e.kind,
        attrs: { unit: p.unit, failure: p.failure },
      }))
    const alarm = run.events.find((e) => e.kind === 'alarm_sounded')
    if (alarm)
      events.push({
        id: 'incident-discovered',
        time: alarm.time,
        area: p.unit,
        kind: 'incident_discovered',
        attrs: { unit: p.unit, failure: p.failure },
      })
    const atRisk = run.limitReachedAt ?? run.points[run.points.length - 1]!.time
    return [
      {
        id: 'lab-alarm-temperature',
        label: `${p.unit} temperature, simulated`,
        kind: 'series',
        unit: 'degC',
        range: rangeOf(times),
        data: run.points.map((x) => ({ t: x.time, v: x.c })),
      },
      {
        id: 'lab-alarm-viability',
        label: `${p.unit}: degrees C above the designer's limit, simulated (an exercise parameter, not biology)`,
        kind: 'features',
        data: metricFile('series', [
          {
            zone: p.unit,
            quantity: "degC above the designer's limit",
            points: run.points.map((x) => ({
              time: x.time,
              value: Math.round((x.c - p.limitC) * 10) / 10,
            })),
          },
        ]),
      },
      {
        id: 'lab-alarm-events',
        label: `${p.unit} alarm events, simulated`,
        kind: 'features',
        data: metricFile('events', events),
      },
      {
        id: 'lab-sample-events',
        label: `${p.unit} samples at risk, simulated`,
        kind: 'features',
        data: metricFile(
          'events',
          run.samples.map((s) => ({
            id: s.sample,
            time: atRisk,
            area: p.unit,
            kind: 'sample_at_risk',
            attrs: { value: s.value, backup: s.backup, location: s.location },
          })),
        ),
      },
      {
        id: 'lab-sample-register',
        label: `${p.unit} sample register, simulated (fictional samples)`,
        kind: 'reports',
        data: run.samples.map((s) => ({
          t: run.points[0]!.time,
          title: s.sample,
          text: [MARK, `location: ${s.location}`, `value: ${s.value}`, `backup: ${s.backup}`].join(
            '\n',
          ),
        })),
      },
    ] satisfies GeneratedDataset[]
  },
}

const inventoryGenerator: SimulatedGenerator<z.output<typeof InventoryParams>> = {
  id: 'lab-inventory-discrepancy',
  label: 'Simulated inventory count with discrepancies and their records causes',
  params: InventoryParams,
  generate(p) {
    const run = runInventory(p)
    return [
      {
        id: 'lab-inventory-count',
        label: 'Inventory count against the record, simulated',
        kind: 'reports',
        data: run.rows.map((r) => ({
          t: run.countedAt,
          title: r.item,
          text: [
            MARK,
            `location: ${r.location}`,
            `expected: ${r.expected}`,
            `observed: ${r.observed}`,
            r.note,
          ]
            .filter(Boolean)
            .join('\n'),
        })),
      },
      {
        id: 'lab-inventory-events',
        label: 'Inventory discrepancies and their causes, simulated (facilitator only)',
        kind: 'features',
        data: metricFile('events', [
          ...(run.rows.some((r) => r.cause)
            ? [
                {
                  id: 'incident-discovered',
                  time: run.countedAt,
                  kind: 'incident_discovered',
                  attrs: {},
                },
              ]
            : []),
          ...run.rows
            .filter((r) => r.cause)
            .map((r) => ({
              id: r.item,
              time: run.countedAt,
              area: r.location,
              kind: 'discrepancy_found',
              attrs: {
                cause: r.cause,
                recordsProblem: r.cause !== 'unaccounted',
                explanation: r.cause ? CAUSE_TEXT[r.cause] : '',
              },
            })),
        ]),
      },
    ] satisfies GeneratedDataset[]
  },
}

const accessGenerator: SimulatedGenerator<z.output<typeof AccessParams>> = {
  id: 'lab-access-log',
  label: 'Simulated access log extract (badge events and door anomalies)',
  params: AccessParams,
  generate(p) {
    const rows = runAccessLog(p)
    return [
      {
        id: 'lab-access-entries',
        label: `${p.door} access log, simulated (fictional people)`,
        kind: 'reports',
        data: rows.map((r) => ({
          t: r.time,
          title: `${r.person}: ${r.event}`,
          text: [MARK, r.afterHours ? 'after hours' : 'normal hours', r.note]
            .filter(Boolean)
            .join('\n'),
        })),
      },
      {
        id: 'lab-access-events',
        label: `${p.door} access anomalies, simulated`,
        kind: 'features',
        data: metricFile(
          'events',
          rows
            .filter((r) => r.afterHours || (r.event !== 'entry' && r.event !== 'exit'))
            .map((r, i) => ({
              id: `anomaly-${i + 1}`,
              time: r.time,
              area: p.door,
              kind: r.event === 'entry' ? 'after_hours_entry' : r.event,
              attrs: { person: r.person },
            })),
        ),
      },
    ] satisfies GeneratedDataset[]
  },
}

const backupGenerator: SimulatedGenerator<z.output<typeof BackupParams>> = {
  id: 'lab-backup-status',
  label: 'Simulated backup status of research systems (hours since the last good backup)',
  params: BackupParams,
  generate(p) {
    const systems = runBackupStatus(p)
    return [
      {
        id: 'lab-backup-series',
        label: 'Hours since the last good backup, simulated',
        kind: 'features',
        data: metricFile(
          'series',
          systems.map((s) => ({
            zone: s.zone,
            quantity: 'hours since the last good backup',
            points: s.points.map((x) => ({ time: x.time, value: x.hours })),
          })),
        ),
      },
    ] satisfies GeneratedDataset[]
  },
}

const followupGenerator: SimulatedGenerator<z.output<typeof FollowupParams>> = {
  id: 'lab-exposure-followup',
  label: 'Simulated exposure follow-up list (fictional staff in and near the room)',
  params: FollowupParams,
  generate(p) {
    const contacts = runFollowup(p)
    return [
      {
        id: 'lab-exposure-events',
        label: 'Exposure report events, simulated (for scoring)',
        kind: 'features',
        data: metricFile('events', [
          {
            id: 'incident-discovered',
            time: p.eventAt,
            area: p.room,
            kind: 'incident_discovered',
            attrs: {},
          },
          {
            id: 'exposure-reported',
            time: p.listedAt,
            area: p.room,
            kind: 'exposure_reported',
            attrs: {},
          },
        ]),
      },
      {
        id: 'lab-exposure-contact-events',
        label: 'Exposure follow-up listing events, simulated (for scoring)',
        kind: 'reports',
        data: contacts.map((c) => ({
          t: p.listedAt,
          title: `contact-${c.code}`,
          text: JSON.stringify({
            id: `contact-${c.code}`,
            kind: 'contact_listed',
            attrs: { contact: c.code, close: c.close },
          }),
        })),
      },
      {
        id: 'lab-exposure-roster',
        label: 'Exposure follow-up roster, simulated (fictional people)',
        kind: 'reports',
        data: contacts.map((c) => ({
          t: p.eventAt,
          title: `${c.code} ${c.name}`,
          text: [
            MARK,
            `where: ${c.where}`,
            `overlap with the event: ${c.overlapMinutes} min`,
            `classification: ${c.close ? 'in the room' : 'nearby'}`,
            `reached: ${c.reachedAt ?? 'not reachable'}`,
          ].join('\n'),
        })),
      },
    ] satisfies GeneratedDataset[]
  },
}

export const LAB_GENERATORS = [
  alarmGenerator,
  inventoryGenerator,
  accessGenerator,
  backupGenerator,
  followupGenerator,
] as const
