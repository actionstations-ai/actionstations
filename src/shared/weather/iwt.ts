// Integrated Warning Team play (spec 0449 FR-10): the seats a weather exercise seats (the
// forecast office, emergency management, broadcasters, an embedded meteorologist), which of the
// meteorology profile's roles sit in each, and which weather products each seat sees. The same
// storms are on every screen; what differs is which products reach whom. Pure data and functions,
// shared by the generator's routing, the facilitator's checks and the tests.

export interface IwtSeat {
  id: string
  label: string
  /** Role keys of the meteorology domain profile that sit in this seat. */
  roleKeys: readonly string[]
  /** Inject types this seat receives. */
  products: readonly string[]
}

const WARNINGS = ['nws_weather_warning', 'cap_alert', 'eas_broadcast'] as const
const OUTLOOKS = [
  'convective_outlook',
  'mesoscale_discussion',
  'spc_watch',
  'hazardous_weather_outlook',
] as const
const REPORTS = ['local_storm_report', 'public_information_statement'] as const
const TROPICAL = [
  'tropical_cyclone_advisory',
  'tropical_cyclone_discussion',
  'tropical_cyclone_local_statement',
  'storm_surge_warning',
] as const

/** Every product the forecast office works with. */
export const OFFICE_PRODUCTS = [
  ...WARNINGS,
  ...OUTLOOKS,
  ...REPORTS,
  ...TROPICAL,
  'area_forecast_discussion',
  'excessive_rainfall_outlook',
  'fire_weather_forecast',
  'red_flag_warning',
  'metar_report',
  'taf_forecast',
  'sigmet_advisory',
  'weather_partner_chat',
  'idss_briefing',
  'weather_figure',
] as const

export const IWT_SEATS: readonly IwtSeat[] = [
  {
    id: 'forecast_office',
    label: 'Forecast office',
    roleKeys: ['lead', 'warn', 'meso', 'dss', 'wcm', 'hydro', 'soo', 'mic', 'comms'],
    products: OFFICE_PRODUCTS,
  },
  {
    id: 'emergency_management',
    label: 'County emergency management',
    roleKeys: ['ema', 'pio'],
    products: [
      ...WARNINGS,
      'spc_watch',
      'hazardous_weather_outlook',
      ...REPORTS,
      ...TROPICAL,
      'red_flag_warning',
      'idss_briefing',
      'weather_partner_chat',
      'weather_figure',
    ],
  },
  {
    id: 'broadcast',
    label: 'Broadcast team',
    roleKeys: ['chief_met', 'on_air', 'wx_producer', 'digital', 'news_dir'],
    products: [
      ...WARNINGS,
      ...OUTLOOKS,
      'local_storm_report',
      'tropical_cyclone_advisory',
      'tropical_cyclone_discussion',
      'weather_partner_chat',
      'weather_figure',
    ],
  },
  {
    id: 'embedded',
    label: 'Embedded meteorologist',
    roleKeys: ['embedded'],
    products: [
      ...WARNINGS,
      ...OUTLOOKS,
      ...TROPICAL,
      'area_forecast_discussion',
      'metar_report',
      'taf_forecast',
      'idss_briefing',
      'weather_figure',
    ],
  },
]

export const seatOfRole = (roleKey: string): IwtSeat | undefined =>
  IWT_SEATS.find((s) => s.roleKeys.includes(roleKey))

export const seatById = (id: string): IwtSeat | undefined => IWT_SEATS.find((s) => s.id === id)

/** Whether a role's seat receives a product; roles outside the seats see everything. */
export function seesProduct(roleKey: string, injectType: string): boolean {
  const seat = seatOfRole(roleKey)
  return !seat || seat.products.includes(injectType)
}

/** The partner names the integrated warning team's message consistency is scored across. */
export const IWT_PARTNERS = [
  'Forecast office',
  'County emergency management',
  'Broadcast team',
] as const
