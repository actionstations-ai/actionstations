# Hazard data

Hazard data is optional. It lets ideas and scenarios fit the place your organization is in, by
using public weather, earthquake, fire and disaster-declaration information for your area. It is
off until you turn it on, and nothing is fetched until you press **Fetch**.

## Turn it on

1. **Project settings, Location:** search for a US county (the list is built into the app, so no
   lookup service is called) or type latitude and longitude. Choose how precisely a fetch sends
   the location: about 1 km (0.01 degrees, the default and what the weather service needs for a
   useful answer) or about 11 km (0.1 degrees). Your exact location stays in the project; only
   the rounded numbers are sent.
2. **Settings, Hazard data:** tick **Allow fetching public hazard data**.
3. Open **Hazard context** (under Advanced in the project menu) and press **Fetch hazard data**.

## What is sent where

The Fetch dialog lists each source with its host, what it sends and what comes back. You tick
the ones you want. Every request carries only the user agent `ActionStations/<version>
(+https://actionstations.ai)`. No project text, document, name or email address is sent.

| Source                            | Host                         | Sent                                               | Needs                |
| --------------------------------- | ---------------------------- | -------------------------------------------------- | -------------------- |
| Weather alerts and 7-day forecast | api.weather.gov              | rounded coordinates                                | US location          |
| Recent and historical earthquakes | earthquake.usgs.gov          | rounded coordinates, radius, minimum magnitude     | nothing              |
| Fire detections (NASA FIRMS)      | firms.modaps.eosdis.nasa.gov | rounded coordinates (a box of about 1 degree), key | a free FIRMS map key |
| Past disaster declarations (FEMA) | www.fema.gov                 | state and county codes                             | US location          |

Requests go only to these four hosts, only over https, follow redirects only within the same
host, time out after 30 seconds and are cut off at 5 MB. A source that answers "too many requests"
is not retried automatically; try it again after a minute. The weather alerts service asks for at
most one request every 30 seconds, and the app keeps to that.

### The FIRMS map key

Fire detections need a free map key from NASA. Get one from the link in Settings, Hazard data,
and paste it there. The key is stored in your computer's keychain (the same place provider keys
go). It is never written to the project, settings, logs, snapshots or error messages. If your
computer has no secure storage, the key cannot be saved and fire detections stay off.

## Snapshots

A fetch saves a **snapshot** in the project (`hazards/<id>.json`): when it was fetched, the
rounded values that were sent, the result of each source, and the records. The raw responses are
not kept. A project keeps up to 10 snapshots; you can label, pin and delete them, and mark one
**Use for ideas**. Because a snapshot is a plain file, the exercise works offline afterwards and
the project can be copied to a computer that is not connected.

A snapshot is dated data for designing an exercise. It is not a warning and must not be used for
operational decisions.

## Using a snapshot

In **Generate**, the ideas form shows **Use hazard context (snapshot of DATE)** when a snapshot
is active. When it is ticked, a short summary (alerts, forecast, earthquake counts, fire
detections, declarations by type, imported layers) goes into the request. The prompt tells the
model the data is dated and may be out of date, to use it to pick plausible hazards and seasons,
and not to present it as current conditions. A scenario started from such an idea records the
snapshot, and its overview prompt gets the same summary. Generating never fetches anything.

A check warns when a row of the MSEL repeats an alert headline, a magnitude or a declaration
number from the snapshot as if it were current, in an exercise dated more than 30 days after the
snapshot.

The controller handbook ends with a **Hazard data sources** section for such scenarios, listing
the sources with the attribution their terms require, including the access date. It is not part
of player material.

## Infrastructure layers (HIFLD)

The public HIFLD Open portal went offline in August 2025, so the app makes no network call for
infrastructure data. Instead use **Import layer file** on the Hazard context screen with a
GeoJSON (a FeatureCollection) or CSV file (with latitude and longitude columns) you downloaded
from an archive (for example the DataLumos or Source Cooperative copies) or from the layer's
original publisher. The file is read on your computer, filtered to the distance you choose, and
at most 200 features per layer are kept with coordinates rounded to 0.01 degrees. You enter where
the file came from, and that is kept with the layer. Files up to 100 MB are accepted.

## Attribution

- Weather alerts and forecast: National Weather Service (weather.gov), open data.
- Earthquakes: Credit: U.S. Geological Survey.
- Fire detections: NASA FIRMS.
- Declarations: "This product uses the Federal Emergency Management Agency's OpenFEMA API, but is
  not endorsed by FEMA."
