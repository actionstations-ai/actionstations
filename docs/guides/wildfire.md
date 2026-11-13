# Wildfire exercises

The **Wildfire and power shutoff** pack gives an exercise a fire where wildland fuels meet a community, a utility deciding whether to turn off power in high wind, or smoke over a school or hospital. It has two parts, and you can use either one.

- The **Wildfire and power shutoff response** domain describes a fire district or agency, a county wildfire and evacuation program, or a utility's wildfire and power shutoff program. Choose it when the organization you are exercising does this work.
- The **wildfire toolkit** adds the same expertise to any other organization. A hospital, a school district, a water utility, a telecom company, an airport or a venue can turn it on without choosing the wildfire domain. See [Toolkits](toolkits.md). Red flag warnings and fire weather products come from the weather toolkit, and floods after a fire from the flooding toolkit, so turn those on beside it.

## What the toolkit knows

- A **perimeter** is a mapped polygon at one time. Between maps the edge of the fire is not known, so the app never shows minute-by-minute truth for a real fire.
- **Evacuation words** vary by place. The notices use the words order, warning, shelter in place and none, and the zone ids and words must be the same on the map, in the zone table and in every message. Some states use numbered levels instead (Level 1 Be Ready, Level 2 Be Set, Level 3 Go Now); if yours does, write those words into your zone definitions and use them everywhere.
- **Containment** is the share of the perimeter with a control line expected to hold. It is not the size of the fire and it can fall. A contained fire can still burn inside its lines; "controlled" comes later, when the lines are complete and secured.
- A **power shutoff** turns off power on circuits in high wind and dry fuels to avoid starting a fire. The notice windows in the examples (48 to 72 hours before for public safety partners, 24 to 48 hours for customers, 1 to 4 hours before, and at the time of de-energization, then again just before power is restored and when restoration is complete) are one state's rule, used as an example. You can change them for your project.
- The **Air Quality Index** categories use the EPA fine particle breakpoints in effect since 6 May 2024. School and event thresholds are local plans, not federal rules.

## Products

Templates for the incident summary and update, an incident status summary in the style of the ICS 209, the evacuation notice (order, warning, shelter in place, all clear and re-entry), the road closure, traffic control point and contraflow board, and the shelter and animal shelter board. For a utility: the forecast notice to public safety partners, the customer notice (warning, power off, restoration, cancellation, all clear), call, text and email scripts, the community resource center notice and the post-event report. For smoke: the smoke advisory, the air quality observation and forecast table, the school closure, early release or indoor day notice, and the hospital, event cancellation or clean-air shelter notice. Alerts use the CAP, emergency alert and mass notification templates already in the app.

Figures are drawn from data and never from AI images, each with a text summary and a data table:

- **Fire map:** perimeters over time, hotspots, spread projections, evacuation zones colored by status with the status word in every label, shelters and road closures. The summary says whether the geometry is historical, interpolated or simulated.
- **Evacuation status board:** each zone with its status, when it was ordered, people and special populations, the clearance time, the time the fire arrives and how far before the latest time to order the order was given.
- **Circuit and customer board** for a power shutoff, with medical baseline customers and critical facilities.
- **Air Quality Index series** over the six EPA category bands, with a local threshold line.
- **Smoke map:** light, medium and heavy smoke and the AQI at places.

## Replay a real fire

A replay uses the one-time fetch described in [Case data](case-data.md): you choose the fire and the period, you see the download size and the services first, and nothing is fetched until you agree.

- **Fire perimeters (National Interagency Fire Center):** the mapped perimeters of a fire over time, from the history for 2000 to 2019, the newer perimeter layer, or the fires burning now. No account is needed.
- **Smoke (NOAA Hazard Mapping System):** analyst-drawn smoke polygons for the days you choose. No account is needed.
- **Hotspots (NASA FIRMS):** satellite detections for a small box. It needs the free map key you may already have saved under Settings, Hazard data.
- **Air quality (EPA AirNow):** hourly air quality for the reporting area nearest a place. It needs a free AirNow key, saved in the same place. Keys stay in your computer's keychain.

The app animates between mapped perimeters and labels those frames **interpolated**. Evacuation zones in a replay are fictional zones drawn on the real terrain, because real zone shapes and order times are held by counties.

## Simulate a fire

For an invented fire, give an ignition point, a fuel type, a wind schedule (with shifts), optionally a slope and a suppression effect, and your evacuation zones with their clearance times and populations. The simulation draws a growing ellipse using a published length-to-breadth relation, finds when the fire reaches each zone and the latest time to order it (arrival less the clearance time), adds hotspots and a smoke plume, and writes an AQI series at the schools and hospitals you list. It is an illustration with a simple relation, not a prediction of fire behavior, and everything is labeled simulated.

For a power shutoff event, give a utility name and when gusts first reach the threshold; the app makes fictional circuits with customers by class, medical baseline customers and critical facilities (or uses the circuits you give), the gust series for each circuit, the patrol and restoration times and the notification windows. It never uses real customer or utility records.

## Decisions and timing

Players record structured decisions: evacuation orders and warnings for a zone picked from the list or drawn on the map, shelter in place, open a shelter, close or control a road, request resources or mutual aid, de-energize or re-energize a circuit, send a shutoff notice, record contact with medical baseline customers, notify a critical facility, activate a community resource center, close a school or move a facility, and issue a smoke advisory. Each has a time and a stated basis.

The evaluation measures compare the decisions with the case data:

- the evacuation order against the latest time to give it for each zone, and whether partners' messages agree;
- the de-energization decision against the time gusts reach the circuit threshold;
- each shutoff notice sent before or at de-energization against its window, with the windows listed in the result (the restoration notices are not timed);
- medical baseline customers reached (the facilitator enters attempts and confirmed contacts, and only a confirmed contact counts) and critical facilities notified;
- a school or facility action against the time the AQI crosses the threshold.

The report says whether the ground truth is historical, interpolated or simulated. A late order is judged against the case's arrival, which for a simulated fire is the scenario's, not the fire's.

## Limits

- A simulated fire is an illustration. The app does not model fire behavior and does not teach fireline tactics.
- Live data is never fetched during a session.
- Real customer, circuit and zone data stay in your own project and are never sent anywhere.
- The example notice windows come from one state. Check your own rules before relying on them.

## Example project

The Wildfire and power shutoff pack includes an example project, **Sawmill County and Foothills Electric Cooperative: foothills wildfire and power shutoff**, with one exercise, _One Road Out_: on a Red Flag Warning morning Foothills Electric de-energizes circuits for fire weather, and at 13:20 a wind-driven fire starts near County Road 68 and runs toward Pine Gulch and Kestrel Springs; the county must set zone statuses against clearance times, evacuate Stonebridge Assisted Living, hold the canyon road, and keep zone messages consistent with the fire agency, the Sheriff and the utility.

Turn the pack on under **Packs**, then open a copy from **Projects → Examples**. The organization, its people and its businesses are fictional; the exercise comes with its injects, media, Situation Manual, evaluation guides and controller handbook, ready to read or run.
