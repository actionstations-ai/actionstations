# Flooding exercises

The **Flooding and hydrology** pack gives an exercise a flood: river gauges and forecasts, flash flood warnings, closures and sandbag logistics, and decisions scored against the water. It has two parts, and you can use either one.

- The **Flood response and floodplain management** domain describes a county flood program, a levee or drainage district, or a regional flood warning program. Choose it when the organization you are exercising is a flood response organization.
- The **flooding toolkit** adds flood expertise to any other kind of organization. A wastewater plant, a farm cooperative, a camp, a school or a transit agency can turn it on without choosing the flood domain. See [Toolkits](toolkits.md).

## What the toolkit knows

- Flood categories (minor, moderate and major) are set for each river gauge from local impacts. Flood stage is where minor flooding begins. A gauge may not have all of them, and flood stage is not the same as bankfull. The figures always show the gauge's own table.
- National Weather Service water products follow Ready, Set, Go: a hydrologic outlook, then a watch, then a warning. A flash flood warning often comes with no watch before it. Excessive rainfall is covered by a flood watch; the separate flash flood watch is kept for special cases such as a dam failure or rain on a burn scar.
- Flash flood warnings carry a damage tag: base, CONSIDERABLE or CATASTROPHIC. Wireless Emergency Alerts go out only for CONSIDERABLE and CATASTROPHIC, and CATASTROPHIC is used only with flash flood emergency language.
- River floods rise over days and give time to sandbag, close roads and evacuate. Flash floods rise in minutes to hours.

## Products

Templates for the hydrologic outlook and flood advisory, the flood forecast discussion, the road closure and low-water crossing status, the sandbag and pump request, the substantial damage letter and the damage assessment summary. Flood watches, warnings and statements use the weather warning template. A levee patrol report uses the field report.

Charts, drawn from data and never from AI images, each with a text summary and a data table:

- **River hydrograph:** observed and forecast stage or flow, the gauge's category bands (with their names and a pattern, not only color), the action and flood stage lines, the forecast crest and its time, past crests and the issue time. When the forecast changed since the last one, the summary says so, including a change of category.
- **Gauge summary:** the current reading, its category, the trend and the flood stage table.
- **River profile:** the stage at several gauges from upstream to downstream, each against its own flood stage.
- **Rainfall and stage:** rain bars above the river line.

## Replay a real flood

A flood replay uses the one-time fetch described in [Case data](case-data.md): you choose the gauge and the period, you see the size of the download and the services first, and nothing is fetched until you agree. The services need no account or key.

- **River gauge (National Weather Service):** the gauge's category stages, past crests, about the last month of readings, and the current forecast.
- **USGS stream gauge values:** observed stage or flow for a past period, instantaneous (up to 45 days) or daily.
- **Flood zones (FEMA):** the effective regulatory zones for a small area.
- **Forecast inundation extent (experimental, National Weather Service):** the modeled extent for the current forecast, where it covers the area.

Pick a past crest from the gauge's list and the app proposes a window of days around it. **Past forecasts are not available:** the National Weather Service keeps only its current forecast, so the forecasts issued during a past flood cannot be retrieved. The scenario can use forecasts simulated from the observed rise, which are labeled as simulated, or none at all.

Regulatory flood zones and modeled extents are labeled differently and never mixed. Neither is a flood determination or an insurance rating.

## Simulate a flood

For an invented event, give a river and its gauges with their flood stage tables, when the first gauge crests and how high, and a schedule of forecasts. The simulation produces consistent stage series at each gauge (a downstream gauge crests later, by travel time), a forecast for each issue time (one forecast can change category), and, if you draw floodplain outlines and list roads, facilities and homes with the stage that floods each, the extent and the count of what is flooded at each time. A flash flood event produces rain, the small basin's rise and the warning area. Everything is labeled simulated and is an illustration, not a hazard map.

## Decisions and timing

Players record structured decisions: activate the operations center, order an evacuation for an area, close a road, open a shelter, order sandbags or pumps, move equipment or livestock, request help, issue a public message. Each has a time and the basis for it (a gauge reading, a forecast issue, a warning).

The evaluation measures compare those decisions with the water: closure before the road floods, evacuation start before the water reaches the area less the clearance time you enter, delivery before the action stage, equipment moved before it floods, warnings against observed flash flood reports, and whether the warning tag, the public message and partner messages agree. For the timing measures, each place's series is the stage in feet above the stage that floods that place.

## Reference library

The **Flooding reference library** pack (installed from the catalog) carries the National Weather Service definitions and water resources products documents, two USGS streamgage fact sheets, the FEMA guidance on dam emergency action plans and inundation mapping, and the Tri-State Integrated Warning Team tabletop situation manual (2018). Some useful material could not be carried: the FEMA flood tabletop package, the FEMA substantial damage desk reference, the FEMA evacuation planning considerations and county after-action reports are listed with links in the pack's README instead.

## Limits

- A simulated or modeled extent is an illustration. It is not a hazard map, a flood zone or an insurance determination.
- Live data is never fetched during a session.
- Storm surge and coastal flooding belong to the weather and port pack. The dam owner's emergency plan stays with the dam domain.

## Example project

The Flooding and hydrology pack includes an example project, **Tallis County Emergency Management and Levee District No. 3: Cedar River flood**, with one exercise, _Eighteen Hours_: days of rain in the upper Cedar basin push the river toward the county; the forecast crest at Cedar Ford is revised twice, from minor to moderate to major, shrinking the lead time for evacuating Cedar Hollow, while the levee district, a care center, a wastewater plant and a cooperative race to move, bag and pump.

Turn the pack on under **Packs**, then open a copy from **Projects → Examples**. The organization, its people and its businesses are fictional; the exercise comes with its injects, media, Situation Manual, evaluation guides and controller handbook, ready to read or run.
