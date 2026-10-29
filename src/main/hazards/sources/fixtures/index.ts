// Recorded-shape answers from the hazard sources, trimmed to what the parsers read. Tests use
// these with a fake fetch; no test ever calls a real service. Place names are real geography
// (allowed by the naming rule); there are no personal names.
export const NWS_ALERTS = {
  type: 'FeatureCollection',
  features: [
    {
      properties: {
        event: 'Flood Watch',
        severity: 'Moderate',
        urgency: 'Future',
        headline: 'Flood Watch issued October 28 at 4:12PM CDT until October 30 at 7:00AM CDT',
        effective: '2026-10-28T16:12:00-05:00',
        expires: '2026-10-30T07:00:00-05:00',
        areaDesc: 'Cook; Lake',
      },
    },
    { properties: { event: 'Wind Advisory', severity: 'Minor', headline: null, areaDesc: 'Cook' } },
    { properties: { severity: 'Minor' } },
  ],
}

export const NWS_POINTS = {
  properties: { forecast: 'https://api.weather.gov/gridpoints/LOT/76,73/forecast' },
}

export const NWS_FORECAST = {
  properties: {
    periods: [
      {
        name: 'Tonight',
        temperature: 44,
        temperatureUnit: 'F',
        windSpeed: '10 to 15 mph',
        shortForecast: 'Rain Likely',
      },
      { name: 'Thursday', temperature: 52, temperatureUnit: 'F', shortForecast: 'Showers' },
    ],
  },
}

export const USGS_QUAKES = {
  type: 'FeatureCollection',
  features: [
    {
      id: 'us7000abcd',
      properties: { mag: 3.1, place: '12 km NE of Example, Illinois', time: 1_761_000_000_000 },
      geometry: { type: 'Point', coordinates: [-87.5, 41.95, 8.4] },
    },
    {
      id: 'us7000efgh',
      properties: { mag: 4.6, place: '90 km S of Example, Indiana', time: 1_700_000_000_000 },
      geometry: { type: 'Point', coordinates: [-87.6, 41.1] },
    },
    { id: 'broken', properties: { mag: null, time: 1 }, geometry: { coordinates: [0, 0] } },
  ],
}

export const FIRMS_CSV = [
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight',
  '41.90,-87.60,330.1,0.4,0.4,2026-10-28,0745,N,n,2.0NRT,290.2,3.4,D',
  '41.60,-87.20,340.5,0.4,0.4,2026-10-28,0745,N,h,2.0NRT,291.0,8.9,D',
].join('\n')

export const OPENFEMA = {
  DisasterDeclarationsSummaries: [
    {
      disasterNumber: 4749,
      declarationType: 'DR',
      declarationDate: '2023-07-14T00:00:00.000Z',
      incidentType: 'Flood',
      declarationTitle: 'SEVERE STORMS AND FLOODING',
      designatedArea: 'Cook (County)',
    },
    {
      disasterNumber: 4749,
      declarationType: 'DR',
      declarationDate: '2023-07-14T00:00:00.000Z',
      incidentType: 'Flood',
      declarationTitle: 'SEVERE STORMS AND FLOODING',
      designatedArea: 'Cook (County)',
    },
    {
      disasterNumber: 3500,
      declarationType: 'EM',
      declarationDate: '2020-03-13T00:00:00.000Z',
      incidentType: 'Biological',
      declarationTitle: 'COVID-19 PANDEMIC',
      designatedArea: 'Cook (County)',
    },
  ],
}

export const LAYER_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { NAME: 'Lakeside General', TYPE: 'Hospital' },
      geometry: { type: 'Point', coordinates: [-87.631, 41.882] },
    },
    {
      type: 'Feature',
      properties: { NAME: 'Far Away Clinic' },
      geometry: { type: 'Point', coordinates: [-80.0, 35.0] },
    },
  ],
}

export const LAYER_CSV = 'name,type,latitude,longitude\n"Harbor, North",Pump station,41.9,-87.6\n'
