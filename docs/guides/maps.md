# Maps

Maps show where injects happen. Open **Maps** under Advanced in the sidebar.

## Site plans

**Add site plan** takes a PNG, JPEG or WebP image up to 50 megapixels, or one page of a PDF (set
**PDF page** first; the page is drawn at 200 dpi and the PDF is kept beside it). Add places (a name and a kind), pick one, then click the plan to pin it, or type the
position as percent across and down. A place can name a facility fact such as `gates:A1`, and
**Pin facility facts** lists facts not placed yet. Places belong to the project, so every scenario
shares them. Give an MSEL row up to five places from its row menu, **Places…**. When you generate an MSEL the
model is given your place names; a row whose text names a place or its fact entry exactly gets that
place without any model call.

**Show map on screen** (Facilitate, Map tab) opens the map in the presentation window with only the
delivered pins. The MSEL and controller handbook PDFs add **Locations** pages: each site plan with
numbered markers (12 per page) and a legend of the rows.

## Facilitate

The **Map** tab beside the timeline draws delivered rows (filled), due rows (filled with a ring and
"due") and, only when **Show upcoming** is on, upcoming rows (dashed). Several rows at one place show
a number. Selecting a pin selects the row, and the **Locations** list under the map gives the same
information as text for keyboard and screen reader use.

### Map on devices

While a live session runs, the Map tab has a **Map on devices** checkbox. Each phone then gets the map
with only the places of messages that reached that seat, sent to that device alone. A site plan arrives
as a sealed picture; a geographic map arrives as a schematic with coordinates, with no tiles fetched by
the phone. See [Live play](live-play.md).

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

## Map on devices

During a live session, tick **Map on devices** on the Facilitate Map tab. Each phone gets the map
with only the places of messages that reached its seat; places appear as you send messages and
disappear if you withdraw one. A site plan shows its picture with numbered places. A geographic
map shows the places as a schematic with coordinates (the phone page has no street map). Untick
the box to take the map off the phones.

## Place names on offline maps

Offline vector maps name places, roads and water in Latin script. The font is Noto Sans (Latin
ranges only), bundled in the app under the SIL Open Font License; the licence text is in
`src/renderer/src/components/map/geo/glyphs/OFL.txt`. Names in other scripts are left out until
more font ranges are bundled.

## Locations pages for geographic maps

The MSEL and handbook exports add a Locations page for each geographic map the MSEL uses. Places
are numbered and plotted by latitude and longitude on a plain frame, with the coordinates in the
legend. The page has no street map; print the map from the Maps page if you need one.

## Not yet

The WebGL check on packaged Linux and Windows builds, and a street map picture on exported
Locations pages for geographic maps.

## Map updates

**Settings, Maps** has a switch to check for new state map files when the app checks for new
versions. It needs the version check on, runs at most once a day, compares checksums only and
downloads nothing.
