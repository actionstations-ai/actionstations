# Maps

Maps show where injects happen. Open **Maps** under Advanced in the sidebar.

## Site plans

**Add site plan** takes a PNG, JPEG or WebP image up to 50 megapixels (a PDF page: save it as a
PNG first). Add places (a name and a kind), pick one, then click the plan to pin it, or type the
position as percent across and down. A place can name a facility fact such as `gates:A1`, and
**Pin facility facts** lists facts not placed yet. Places belong to the project, so every scenario
shares them. Give an MSEL row up to five places with its `placeIds`.

## Facilitate

The **Map** tab beside the timeline draws delivered rows (filled), due rows (filled with a ring and
"due") and, only when **Show upcoming** is on, upcoming rows (dashed). Several rows at one place show
a number. Selecting a pin selects the row, and the **Locations** list under the map gives the same
information as text for keyboard and screen reader use.

## Geographic maps and map data

**Add map** makes a map pinned by latitude and longitude. Its map data is one of:

- **Online** (Settings › Maps, off by default). When on, the map provider receives your computer's
  IP address and the map tiles for the area you view. Nothing else from your project is sent.
  OpenFreeMap is the default. OpenStreetMap standard tiles are for viewing only, under the
  [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/): tiles are cached as
  their headers say (at least 7 days), never prefetched, and never saved for offline use. A custom
  address needs an attribution.
- **State map files**, downloaded from the Action Stations maps catalog when you ask.
- **An area** around a site, downloaded from OpenFreeMap within its offline terms (3,000 tiles,
  50 MB, 4 requests at a time). The estimate is shown before you start.
- **Your own** `.pmtiles` or `.mbtiles` file (up to 4 GB with bounds and an attribution).

Every download is started by you, checked against its checksum, and can be cancelled in the jobs
tray. Files are stored once per computer under the app's data folder and shared by projects.

## Attribution and licence

Attribution is always shown on the map. Map data from OpenStreetMap is licensed ODbL: a project that
carries copied map data is distributing a Produced Work and must keep its attribution.

## Not yet

PDF pages, the presentation window, devices and export "Locations" pages, place labels on offline
maps, and the generator filling `placeIds`.
