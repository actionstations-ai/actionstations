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
  description:
    'Simulates an ultra-low freezer failure: the contents warm toward room temperature, the alarm sounds (or fails), the call-out goes out, and the samples reach their limit unless someone acts. Writes the temperature curve, the alarm and call-out events and a register of samples at risk.',
  toolkits: ['lab_safety'],
  example: {
    seed: 1,
    unit: 'Freezer 3',
    failure: 'compressor_failure',
    failureAt: '2026-10-24T22:30:00Z',
    durationHours: 24,
    stepMinutes: 5,
    setPointC: -80,
    ambientC: 22,
    alarmThresholdC: -65,
    limitC: -50,
    warmingTimeConstantHours: 10,
    recoverAfterMin: 720,
    recoveryTimeConstantHours: 3,
    alarmFails: false,
    calloutDelayMin: 15,
    acknowledgeAfterMin: 90,
    sampleCount: 24,
    irreplaceableFraction: 0.25,
  } satisfies z.input<typeof AlarmParams>,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    unit: { label: 'Unit', help: 'Name of the freezer or storage unit.' },
    failure: { label: 'Failure' },
    failureAt: { label: 'Failure starts (UTC)' },
    durationHours: { label: 'Hours simulated', help: '1 to 72 hours after the failure.' },
    stepMinutes: { label: 'Reading interval (minutes)', help: '1 to 30 minutes between readings.' },
    setPointC: { label: 'Set point (°C)' },
    ambientC: { label: 'Room temperature (°C)', help: 'Must be above the sample limit.' },
    alarmThresholdC: {
      label: 'Alarm threshold (°C)',
      help: 'Must be warmer than the set point and colder than the sample limit.',
    },
    limitC: {
      label: 'Sample limit (°C)',
      help: 'The limit for the samples in this unit; the alarm-to-loss window ends here.',
    },
    warmingTimeConstantHours: {
      label: 'Warming time constant (hours)',
      help: 'Hours for the contents to close 63 percent of the gap to room temperature, 0.5 to 100.',
    },
    recoverAfterMin: {
      label: 'Cause ends (minutes)',
      help: 'Optional. Minutes after the failure that the door is closed, power restored or the unit repaired.',
    },
    recoveryTimeConstantHours: {
      label: 'Recovery time constant (hours)',
      help: 'Hours for the unit to cool back toward the set point once the cause ends, 0.25 to 48.',
    },
    alarmFails: {
      label: 'Alarm fails',
      help: 'The alarm does not sound or does not reach anyone.',
    },
    calloutDelayMin: {
      label: 'Call-out delay (minutes)',
      help: 'Minutes from the alarm to the first call-out attempt.',
    },
    acknowledgeAfterMin: {
      label: 'Acknowledged after (minutes)',
      help: 'Optional. Minutes from the alarm until someone acknowledges it; leave empty for never.',
    },
    sampleCount: { label: 'Samples in the unit', help: '1 to 60.' },
    irreplaceableFraction: {
      label: 'Share irreplaceable',
      help: 'Share of samples that cannot be replaced, 0 to 1.',
    },
  },
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
  description:
    'Simulates an inventory count of registered items in freezers against the record, with discrepancies that most often have a records cause. Writes the count against the record and, for the facilitator only, each discrepancy and its cause.',
  toolkits: ['lab_safety'],
  example: {
    seed: 1,
    entity: 'Marston State University (fictional registered entity)',
    items: 12,
    freezers: ['Freezer 3', 'Freezer 4'],
    discrepancies: 1,
    cause: 'mislabeled_box',
    countedAt: '2026-10-21T09:15:00Z',
  } satisfies z.input<typeof InventoryParams>,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    entity: { label: 'Registered entity', help: 'A fictional organization name.' },
    items: { label: 'Items', help: 'Registered items counted, 2 to 40.' },
    freezers: { label: 'Freezers', help: 'One freezer name per line, 1 to 8.' },
    discrepancies: {
      label: 'Discrepancies',
      help: 'Items whose count differs from the record, 0 to 10.',
    },
    cause: {
      label: 'Cause of every discrepancy',
      help: 'Optional. Leave empty to draw records causes, with about one in nine unaccounted.',
    },
    countedAt: { label: 'Counted at (UTC)' },
  },
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
  description:
    'Simulates one day of badge events at a laboratory door, with the door anomalies you choose. Writes the access log extract of fictional staff and the anomalies found in it.',
  toolkits: ['lab_safety'],
  example: {
    seed: 1,
    door: 'Whitfield Hall Room 118, door 1',
    day: '2026-10-20T00:00:00Z',
    staff: 5,
    anomalies: ['after_hours_entry', 'door_held_open'],
    openMin: 420,
    closeMin: 1140,
  } satisfies z.input<typeof AccessParams>,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    door: { label: 'Door' },
    day: { label: 'Day (midnight UTC)' },
    staff: { label: 'Staff', help: 'People with access who badge in that day, 1 to 12.' },
    anomalies: { label: 'Anomalies', help: 'Door anomalies to place in the log, up to 6.' },
    openMin: {
      label: 'Opening (minutes from midnight)',
      help: 'Start of normal hours, e.g. 420 for 07:00.',
    },
    closeMin: {
      label: 'Closing (minutes from midnight)',
      help: 'End of normal hours, e.g. 1140 for 19:00.',
    },
  },
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
  description:
    'Simulates the nightly backups of research systems, with some systems whose backup stops and stays down. Writes the hours since the last good backup for each system, by hour.',
  toolkits: ['lab_safety'],
  example: {
    seed: 1,
    systems: [
      'Instrument computer A',
      'Instrument computer B',
      'Electronic lab notebook',
      'Study database',
    ],
    start: '2026-10-21T00:00:00Z',
    hours: 72,
    failing: ['Instrument computer B'],
    failsAtHour: 20,
    everyHours: 24,
  } satisfies z.input<typeof BackupParams>,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    systems: { label: 'Systems', help: 'One research system per line, 1 to 12.' },
    start: { label: 'Start (UTC)' },
    hours: { label: 'Hours simulated', help: '6 to 240 hours.' },
    failing: {
      label: 'Failing systems',
      help: 'One per line: systems from the list whose backup stops and stays down.',
    },
    failsAtHour: { label: 'Backups stop (hour)', help: 'Hours after the start, 0 to 240.' },
    everyHours: {
      label: 'Backup interval (hours)',
      help: 'The backup runs every this many hours.',
    },
  },
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
  description:
    'Simulates the follow-up list after a laboratory exposure: fictional staff in the room (close contacts) and in adjacent rooms, each reached within a set time or not at all. Writes the exposure report and listing events and the follow-up roster.',
  toolkits: ['lab_safety'],
  example: {
    seed: 1,
    room: 'Room 214',
    eventAt: '2026-10-21T16:35:00Z',
    inRoom: 3,
    adjacent: 6,
    unreachableFraction: 0.1,
    maxReachHours: 30,
    listedAt: '2026-10-21T17:10:00Z',
  } satisfies z.input<typeof FollowupParams>,
  fields: {
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    room: { label: 'Room' },
    eventAt: { label: 'Exposure event (UTC)' },
    inRoom: { label: 'People in the room', help: 'Close contacts present at the time, 0 to 30.' },
    adjacent: { label: 'People in adjacent rooms', help: '0 to 60.' },
    unreachableFraction: {
      label: 'Share unreachable',
      help: 'Share of people not reached at all, 0 to 1.',
    },
    maxReachHours: {
      label: 'Reached within (hours)',
      help: 'Latest hours after listing that a reachable person is reached, 1 to 240.',
    },
    listedAt: { label: 'List made (UTC)' },
  },
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
