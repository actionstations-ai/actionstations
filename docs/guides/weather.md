# Weather exercises

The **Weather** toolkit puts real weather into an exercise, for a forecast office practicing its warnings and for any organization that needs a storm to happen to it: an airport with a ground stop, a utility staging crews, a venue clearing a field, a school district sheltering. The **Meteorology** kind of organization is for the forecasters themselves: a forecast office, a broadcast weather team or a meteorologist working with emergency management or a utility.

Turn the toolkit on for a scenario as described in [Toolkits](toolkits.md). The app proposes it when a brief mentions a tornado, a hurricane, a flash flood, a heat wave and similar words, and for airports, utilities, farms, venues, schools, transit, rail, ports, public health, municipal and emergency communications organizations. Everything it makes is marked as an exercise product, so nothing can pass for a live alert.

## What it adds

**Products.** Templates for the products forecasters read and write, laid out as the issuing center prints them: the Storm Prediction Center's outlook, mesoscale discussion and watch; the forecast office's local storm reports, public information statement, area forecast discussion, hazardous weather outlook, red flag warning and fire weather forecast; the hurricane center's advisory and discussion and the office's hurricane local statement and storm surge warning; the excessive rainfall outlook; METARs, TAFs and SIGMETs; a one-page decision support briefing; and a partner chat. The warning, CAP alert and EAS broadcast templates already in the app work with it.

**Format checks.** When the writer drafts an inject, the app checks the formats a forecaster would spot: METAR and TAF groups, the LAT...LON polygon, product headers and issuance times, and the P-VTEC line. A problem goes back to the writer once and, if it stays, shows as a warning on the inject.

**Figures.** Drawn from data, never from an image generator: a radar display (reflectivity, velocity, correlation coefficient) with range rings, places, warning polygons and storm motion; satellite (visible, infrared, water vapor); a skew-T with a surface-based parcel and the key indices, and a hodograph; a meteogram; a model guidance panel and a mesoanalysis map; an ensemble plume; and the hurricane decision timeline. Each figure has a legend, a text description and a data table, so it can be read without color. Each is labeled **historical** or **simulated**.

**Reference library.** A reference library pack lists public documents for this work: the National Weather Service instructions for warning, tropical, aviation and code products, the hurricane center's product guide, an impact-based warning fact sheet, FEMA's hurricane evacuation study and HURREVAC fact sheets, and an integrated warning team exercise manual and report. Add the documents to a project and the writer and the evaluation guides cite them.

## A real past event

Choose the period and the area. For a storm, give its name and year. The app shows what it would fetch, how large it is, which archive it would contact and the terms, and fetches only after you agree. No account or key is needed. See [Case data](case-data.md) for the limits and the fetch log.

- **Radar** from the National Weather Service radar archive on Amazon's open data. Only the first part of each volume is downloaded (the lowest scans), cropped to your range and kept as the radar's own values. A five-minute step is the default.
- **Storm reports** from the Storm Prediction Center archive: tornado, wind and hail reports as points that appear when they were reported. They also serve as the ground truth for warning verification.
- **Warning polygons** from the Iowa Environmental Mesonet archive of National Weather Service warnings.
- **Soundings** from the same archive, for the skew-T and hodograph.
- **Hurricane tracks** from the hurricane center's best-track file.

Model guidance and satellite imagery are not fetched yet; use a simulated event for those figures.

A figure inject points at a fetched dataset and shows the radar scan or sounding for the moment of the exercise. Dates, places and products follow the real event; the exercising organization, its people and its businesses stay fictional.

## A simulated event

When there is no real event to replay, **Generate** a simulated one. Nothing here is a record of a real event, and every dataset says so.

- **Convective event.** Choose a storm mode (supercell, line or multicell), where the storm starts, where it moves from and how fast, how strong it is and whether and when a tornado touches down. You get radar frames with rotation and, during the tornado, a patch of low correlation coefficient where debris would be; storm reports along the track; the warning a simulated office issues a set number of minutes before the tornado; a sounding that fits the storm mode; analysis and model grids that move with the storm; and a station's observations as it passes.
- **Hurricane.** Choose a track, how strong it gets and when, its size and the places you care about. You get the track and the wind at each place over time, including the hour tropical-storm-force winds arrive.

The same settings give the same data every time.

## Decisions

Players and the facilitator can record five decisions, in live play and in Facilitate:

- **Issue a warning:** the warning, the area (draw it on the map or pick the county), how long it is valid, the source, an impact tag and the basis for the decision.
- **Issue a statement:** a follow-up or a public information statement, with what changed.
- **Cancel or let a warning expire,** with the reason.
- **Brief a partner:** who, the key message and the time.
- **Order an evacuation:** the zone and the time.

Each decision is saved with the time it was made, and the evaluation uses them.

## Integrated warning team play

An integrated warning team exercise puts the forecast office, emergency management and broadcasters in the same storm. Everyone sees the same weather; what differs is which products reach whom. The forecast office sees all of them. Emergency management receives warnings, statements, watches, the hazardous weather outlook, hurricane products and the briefing. Broadcasters receive warnings, outlooks, watches, storm reports and the hurricane advisory and discussion. An embedded meteorologist receives the warnings, outlooks, hurricane products, forecasts and observations their organization acts on. At the hot wash the evaluation compares what each seat told the public on the key facts.

## Evaluation

- **Warning verification.** The decisions you recorded as warnings are compared with the storm reports. A warning that comes before a report, up to 45 minutes ahead, is a hit; a report with no warning before it is a miss; a warning with no report in its window is a false alarm. The result shows the probability of detection, the false alarm ratio, the critical success index and the lead time of each event and on average. Two cautions: lead time counts only hits, so read it with the false alarm ratio; and matching uses the time window, not the polygon, so check the event table for the places.
- **Hurricane decision timeline.** For each zone, the evacuation order is compared with the arrival of tropical-storm-force winds less the time the zone needs to clear, which comes from the community's hurricane evacuation study. The timeline figure shows the latest moment to order and when the order came.
- **Message consistency.** The three seats' statements on the key facts (the warning's expiry, the evacuation zones, the shelters) are compared. See [Evaluation metrics](evaluation-metrics.md).

The evaluation guides for Public Information and Warning, Situational Assessment, Operational Communications and Planning come first for meteorology exercises, with critical tasks such as a warning carrying the right hazard, polygon, duration and tags, a basis recorded before each decision, and products transmitted with receipt confirmed.

## Before you rely on it

The templates, figures and examples follow the National Weather Service's published product specifications as closely as an exercise needs, but they are not operational products, and the sounding indices are teaching-grade values. Have a forecaster or a university meteorology instructor read what you plan to use in training.
