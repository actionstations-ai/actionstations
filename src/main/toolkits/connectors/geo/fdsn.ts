// FDSN waveform replay connector (spec 0450 FR-9, NFR-2): seismograms for named stations from a
// public FDSN data center, decoded from miniSEED into series datasets for the seismogram figure.
// Good citizenship toward the data centers: the user names the network and up to six stations, the
// window is at most 30 minutes, requests go out at most three at a time (the data centers' stated
// limit), the host is one of three fixed centers, and every dataset cites its network code and
// data center. Nothing is requested before the user consents.
import { AppError } from '../../../lib/errors'
import {
  registerConnector,
  type Connector,
  type ConnectorQuery,
  type ConnectorResult,
} from '../registry'
import { checkRange, isoSecond, item, jsonFile, patternOption, pool } from './common'
import { decodeMiniSeed, type MiniSeedTrace } from './miniseed'

export const FDSN_MAX_CONCURRENT = 3
export const FDSN_MAX_STATIONS = 6
export const FDSN_MAX_WINDOW_SECONDS = 1800
const MAX_POINTS = 12_000

export const FDSN_CENTERS = {
  earthscope: { host: 'service.earthscope.org', name: 'EarthScope Consortium' },
  scedc: { host: 'service.scedc.caltech.edu', name: 'Southern California Earthquake Data Center' },
  ncedc: { host: 'service.ncedc.org', name: 'Northern California Earthquake Data Center' },
} as const
type Center = keyof typeof FDSN_CENTERS

const NETWORK = /^[A-Z0-9]{1,2}$/
const STATIONS = /^[A-Z0-9]{1,5}(,[A-Z0-9]{1,5}){0,5}$/
const CHANNEL = /^[A-Z0-9?*]{3}$/
const LOCATION = /^([A-Z0-9?*]{1,2}|--)$/

interface WaveformRequest {
  center: Center
  network: string
  stations: string[]
  channel: string
  location: string
  seconds: number
}

export function parseWaveformQuery(q: ConnectorQuery): WaveformRequest {
  const seconds = checkRange(q, 1) * 86_400
  if (seconds <= 0 || seconds > FDSN_MAX_WINDOW_SECONDS)
    throw new AppError(
      'VALIDATION',
      `Ask for a window of up to ${FDSN_MAX_WINDOW_SECONDS / 60} minutes`,
    )
  const centerRaw = q.options.center ?? 'earthscope'
  if (typeof centerRaw !== 'string' || !(centerRaw in FDSN_CENTERS))
    throw new AppError(
      'VALIDATION',
      `center must be one of: ${Object.keys(FDSN_CENTERS).join(', ')}`,
    )
  const network = patternOption(q, 'network', NETWORK, 'network code')
  const stations = patternOption(
    q,
    'stations',
    STATIONS,
    'station list (up to six codes, separated by commas)',
  )
  if (!network || !stations)
    throw new AppError('VALIDATION', 'Name the network and up to six stations')
  return {
    center: centerRaw as Center,
    network,
    stations: stations.split(','),
    channel: patternOption(q, 'channel', CHANNEL, 'channel code') ?? 'BHZ',
    location: patternOption(q, 'location', LOCATION, 'location code') ?? '*',
    seconds,
  }
}

export function dataselectUrl(r: WaveformRequest, station: string, q: ConnectorQuery): string {
  const p = new URLSearchParams({
    net: r.network,
    sta: station,
    loc: r.location,
    cha: r.channel,
    starttime: isoSecond(q.range.start),
    endtime: isoSecond(q.range.end),
    format: 'miniseed',
    nodata: '204',
  })
  return `https://${FDSN_CENTERS[r.center].host}/fdsnws/dataselect/1/query?${p.toString()}`
}

const lower = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

interface Series {
  id: string
  label: string
  points: { t: string; v: number }[]
  decimated: boolean
}

function seriesOf(t: MiniSeedTrace): Series | undefined {
  if (!t.samples.length || !t.sampleRate) return undefined
  const stride = Math.max(1, Math.ceil(t.samples.length / MAX_POINTS))
  const points: Series['points'] = []
  for (let i = 0; i < t.samples.length; i += stride)
    points.push({
      t: new Date(t.startMs + (i / t.sampleRate) * 1000).toISOString(),
      v: t.samples[i]!,
    })
  const code = `${t.network}.${t.station}.${t.location || '--'}.${t.channel}`
  return {
    id: `wf-${lower(t.network)}-${lower(t.station)}-${lower(t.location || 'xx')}-${lower(t.channel)}`,
    label: `Seismogram ${code}, ${t.sampleRate / stride} samples per second`,
    points,
    decimated: stride > 1,
  }
}

export const fdsnWaveforms: Connector = {
  id: 'fdsn-waveforms',
  label: 'Seismograms from an FDSN data center',
  source: 'FDSN data centers (EarthScope, SCEDC, NCEDC)',
  terms:
    'Waveform data are free to use; cite the network and the data center. Data centers ask for at most three simultaneous downloads.',
  hosts: Object.values(FDSN_CENTERS).map((c) => c.host),
  estimate(q) {
    const r = parseWaveformQuery(q)
    const perStation = Math.round(Math.min(r.seconds, MAX_POINTS) * 40 * 2)
    return {
      items: r.stations.map((s) =>
        item(
          `wf-${lower(r.network)}-${lower(s)}`,
          `Seismogram ${r.network}.${s}.${r.channel}`,
          'series',
          perStation + 30_000,
        ),
      ),
      requests: r.stations.length,
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const r = parseWaveformQuery(q)
    const center = FDSN_CENTERS[r.center]
    const results = await pool(
      r.stations.map((s) => async () => {
        const res = await ctx.get(dataselectUrl(r, s, q))
        if (res.status === 204) return [] as MiniSeedTrace[]
        if (res.status !== 200)
          throw new AppError('INTERNAL', `${center.name} answered ${res.status} for station ${s}`)
        try {
          return decodeMiniSeed(res.data)
        } catch (e) {
          throw new AppError(
            'INTERNAL',
            `${center.name} did not return miniSEED for station ${s}: ${(e as Error).message}`,
          )
        }
      }),
      FDSN_MAX_CONCURRENT,
    )
    const series = results
      .flat()
      .map(seriesOf)
      .filter((s): s is Series => !!s)
    if (!series.length)
      throw new AppError(
        'NOT_FOUND',
        'The data center had no waveform data for those stations and times',
      )
    const seen = new Set<string>()
    const unique = series.filter((s) => !seen.has(s.id) && !!seen.add(s.id))
    const decimated = unique.some((s) => s.decimated)
    return {
      datasets: unique.map((s) => ({
        id: s.id,
        kind: 'series' as const,
        label: s.label,
        file: `${s.id}.json`,
        unit: 'counts',
        range: { start: s.points[0]!.t, end: s.points[s.points.length - 1]!.t },
      })),
      files: unique.map((s) => jsonFile(`${s.id}.json`, s.points)),
      ...(decimated
        ? { modified: `Traces longer than ${MAX_POINTS} samples were thinned to every Nth sample.` }
        : {}),
      citation: `Network ${r.network} (FDSN network code), data from ${center.name} (https://${center.host}/).`,
    }
  },
}

export const registerFdsn = (): void => registerConnector(fdsnWaveforms)
