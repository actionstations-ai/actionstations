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

## Overlays

A geographic map can carry overlays: the information that sits on top of the map during an exercise.
An overlay layer is one of:

- **Areas**, such as warning areas, watch boxes, outlook areas and flood extents.
- **Lines and tracks**, such as a storm track, a road closure or a river reach. A track shows a dot at
  each point along it.
- **Cones and swaths**, such as a forecast cone with its centre line.
- **Points**, such as storm reports, gauges and assets, with a reading when there is one.
- **Grids**, such as radar or a model field, drawn with a colour scale. A grid is placed by the
  longitude and latitude of its edges.

Below the map you get:

- **Map layers**: a checkbox for each layer. Tab moves between layers and Space turns one on or off.
- **A time slider**, when any overlay has a time. Each feature can have a start and an end; the map shows
  what is in force at the time you choose. The Earlier and Later buttons and the arrow keys step through
  the times, and the time is written out beside the slider (always in UTC). **Show all times** draws
  every overlay at once. A grid with several frames shows the frame in force.
- **An overlay legend**: one entry for each layer. Every item has a name, and the swatches differ by
  line pattern and fill hatch as well as colour, so the map still reads in grey or with colour
  blindness. A grid's legend lists the values of its colour scale with their unit.
- **Overlay data**: the same information as a table (layer, item, kind, time, where or value), for anyone
  who cannot see the map.

The outline of a place (an area drawn for a place on a map) is drawn too: on a geographic map it is an
overlay layer called Place areas, and on a site plan it is a dashed outline over the picture.

Overlays come from data in the project, such as the case data of a toolkit, which turns its GeoJSON
datasets and grids into layers. Features that cannot be drawn (no shape, or coordinates off the globe)
are left out, and the rest are drawn.

### Overlays in pictures and exports

**Show map on screen** shows the overlays with the same controls. The snapshot of a geographic map is a
picture of the overlays at the time you choose (or all of them) on a plain frame with the numbered
places and the legend. The MSEL and handbook **Locations** pages draw the overlays in the same way, with
the numbered places inside the drawing, the legend, a one-line summary and the data table. A page
shows every overlay at once; each feature's times are in the table. The pictures have no street map.

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
ranges only), bundled in the app under the SIL Open Font License; the licence text is
included with the app. Names in other scripts are left out until
more font ranges are bundled.

## Locations pages for geographic maps

The MSEL and handbook exports add a Locations page for each geographic map the MSEL uses. Places
are numbered and plotted by latitude and longitude on a plain frame, with the coordinates in the
legend. The page has no street map; print the map from the Maps page if you need one. A map with
overlays also gets a page when no place is used (see Overlays above).

## Not yet

The WebGL check on packaged Linux and Windows builds, and a street map picture on exported
Locations pages for geographic maps.

## Map updates

**Settings, Maps** has a switch to check for new state map files when the app checks for new
versions. It needs the version check on, runs at most once a day, compares checksums only and
downloads nothing.
