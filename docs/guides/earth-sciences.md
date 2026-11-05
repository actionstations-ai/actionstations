# Earth sciences: earthquakes, volcanoes, tsunamis and landslides

Four toolkits and one kind of organization let you exercise the scientists who monitor and warn, and everyone who acts on their warnings. A volcano observatory, a seismic network with earthquake early warning, a tsunami warning center and a geological survey are all covered, and so are the county, the school district, the transit agency, the port, the airport and the hospital that have to decide what to do. The toolkits work in any exercise: a hospital can add an earthquake, a port a tsunami and an airport an ash cloud. Read the [toolkits guide](toolkits.md) first if toolkits are new to you.

## What you can switch on

| Toolkit                           | For                                                                               | Products                                                                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Earthquakes and early warning** | seismic networks, early warning operations, everyone with buildings and lifelines | earthquake event summary, PAGER alert, aftershock forecast, early warning alert (phone and app), early warning automated action log, building safety placard, lifeline status board, ground failure summary |
| **Volcanoes and ash**             | volcano observatories, emergency managers, schools, airports, utilities           | Volcano Activity Notice, Volcano Observatory Notice for Aviation, alert level and aviation color code badge, volcanic ash advisory, lahar warning and siren activation                                      |
| **Tsunamis**                      | tsunami warning centers, coastal counties, ports, harbors                         | tsunami warning, advisory, watch, information statement and cancellation, and the international threat message                                                                                              |
| **Landslides and debris flows**   | geological surveys, transportation departments, counties below burned slopes      | post-fire debris-flow hazard assessment summary, rainfall threshold guidance, road closure notice, ground failure summary                                                                                   |

Choose **Earth science / geologic hazards** as the kind of organization to start from a profile with observatory, network, warning center and survey roles. The app suggests the toolkits when your brief mentions an earthquake, a volcano, a tsunami or a debris flow.

Every product is marked as an exercise product, so a handout cannot be mistaken for a real notice.

## Rules the writing follows

The toolkits carry the rules a specialist would check, and the scenario check flags text that breaks them:

- **Magnitude and intensity are different.** Magnitude is one decimal number for the earthquake (M 6.8). Intensity is a Roman numeral from I to X for the shaking at a place (VII). They are never swapped.
- **An alert level always comes with its color code.** Normal with Green, Advisory with Yellow, Watch with Orange, Warning with Red, always written as words.
- **Early warning is seconds, and near the epicenter it can be late.** Within roughly 20 to 30 kilometers the alert can arrive after the shaking starts. A warning time longer than the distance allows is flagged.
- **Aftershock forecasts are chances, not predictions.** Nobody can say when aftershocks will end, and a larger earthquake than the mainshock is unlikely but possible.
- **A tsunami watch is not sent as a Wireless Emergency Alert.** Local sources give minutes to the first wave, distant ones give hours.
- **Debris flows follow short, intense rain** on recently burned slopes, not daily totals. Hazard maps are planning guidance, not a forecast for a given day. Ground failure maps describe regions, not single sites.

## Figures

Maps and charts are drawn by the app from data, never made by an image model. Each has a text summary and a data table beside it for screen readers and print. Shaking intensities carry their Roman numerals, areas carry fill patterns and names, and alert levels carry words, so nothing depends on color alone.

Seismograms, aftershock plots (time and magnitude with the running count), early warning timelines (alert against the arrival of strong shaking, by place), volcano monitoring series, tide gauge records, ShakeMap and "Did You Feel It?" maps, epicenter maps with fault traces, ash advisory maps, lahar and tsunami travel-time maps, inundation zones and debris-flow hazard maps are all available. The maps are schematic, with a frame, a scale bar and a legend, and need no map tiles or network.

## Replaying a real event

Where an exercise is built on something that happened, the toolkits can find it and fetch it once, with your consent. You choose the period and the area, the app shows each dataset with its size and the archive it would contact, and nothing is requested until you agree. No account or key is needed. From then on the scenario works offline. See [case data](case-data.md) for the steps and the size limit.

| What you can bring in                                        | From                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| An earthquake, its ShakeMap, felt reports and PAGER estimate | the USGS earthquake catalog (give the event id to take its products)       |
| A planning scenario earthquake (labeled as a scenario)       | the USGS ShakeMap scenario catalog                                         |
| Seismograms for stations you name                            | EarthScope, the Southern California or the Northern California data center |
| Volcano notices for aviation from the past year              | the USGS Hazards Notification System                                       |
| Past tsunami events and runups                               | the NOAA historical tsunami database                                       |
| Tide gauge records and the predicted tide                    | NOAA tides and currents                                                    |
| Deep-ocean tsunami buoy records                              | the NOAA National Data Buoy Center                                         |
| Fault traces                                                 | the USGS Quaternary fault database                                         |
| Post-fire debris-flow assessments and rainfall thresholds    | the USGS Landslide Hazards Program                                         |

Some things to know:

- **Seismograms are courteous to the data centers.** At most six stations and 30 minutes at a time, at most three downloads at once, and every dataset names the network and the data center that served it.
- **Scenario earthquakes are not real earthquakes.** Their labels, source line and citation all say so, and the scenario catalog has no real dates, so you choose them by magnitude.
- **Volcano notices go back one year.** Older notices are on each volcano's page and can be pasted into the scenario.
- **Hazard polygons for burned areas are not fetched.** The assessment's summary and rainfall thresholds come in as text, with the address of the item that holds the map files.

## Simulating an event

For an exercise about a fictional event the app can generate one, labeled simulated everywhere:

- **An earthquake** at a place and magnitude you choose, with shaking that falls with distance from the fault, an aftershock sequence, the aftershock forecast written from the same numbers (so the forecast and the sequence agree), and early warning times that are late near the epicenter.
- **Volcanic unrest** with rising earthquakes, uplift and gas, an alert level that follows a stated rule, and either an eruption on the day you choose or none.
- **A lahar** with an arrival time for each community along the valley.
- **A tsunami** with arrival times from distance, naming local and distant places, and a tide gauge record.
- **Debris flows** from a rainfall scenario, one flow for each basin whose 15-minute rain crosses its threshold.

These use simple published relations, not physics models of ground motion, ash or waves. They are for exercises, not for forecasting.

## Decisions and timing

The toolkits add decisions to record in live play: change the alert level and color code, issue or upgrade or cancel a tsunami message, order an evacuation, close or re-open a road or rail line, take an early warning automated action, place a building placard and issue a public statement.

Field metrics then compare what players did with the clocks that matter: a protective action against the arrival of strong shaking, an evacuation against the first wave or the lahar's travel time, a closure against the rainfall threshold, and message upgrades or cancellations against the observed waves. See [evaluation metrics](evaluation-metrics.md).

## Reference library

An **Earth sciences reference library** pack carries USGS fact sheets on early warning, PAGER, aftershock forecasts, lahars and post-fire debris flows. Install it from the catalog and use **Add from pack** to bring a fact sheet into a project. Documents that are not in the public domain, such as the international aviation documents on volcanic ash, are linked, not copied.

## Accuracy

Exercise products follow the real formats closely, but they are teaching material. Have a seismologist or volcanologist and an emergency manager review a scenario before you use it for a real exercise, and treat every number in a simulated event as invented.
