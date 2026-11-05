# Space weather exercises

The **Space weather and satellite operations** pack gives an exercise a geomagnetic storm, a radiation storm, a radio blackout or a loss of satellite navigation, with decisions scored by the clocks that matter. It has two parts, and you can use either one.

- The **Space weather and satellite operations** domain describes a grid control room (a reliability coordinator and a transmission operator following a geomagnetic disturbance operating plan), a satellite operations center, or a GNSS timing and network operations team. Choose it when that is the organization you are exercising.
- The **space weather toolkit** adds the expertise to any other organization. A utility, a telecom carrier, an airline, a farm cooperative, a rail operator or a port can turn it on without choosing the domain. See [Toolkits](toolkits.md).

## What the toolkit knows

- The NOAA scales: G levels map to Kp (G1 is Kp 5 up to G5 at Kp 9), R levels to the X-ray class of a flare (R1 is M1, R3 is X1, R5 is X20) and S levels to proton flux (S1 is 10 particle flux units, each level ten times higher).
- A watch is elevated risk with uncertain timing, a warning is an event that is occurring, imminent or likely, and an alert says a threshold has been crossed. Products carry a message code, a serial number and an issue time in UTC.
- Levels describe potential effects, impacts are regional, and the arrival time of a coronal mass ejection is uncertain by hours.
- The toolkit gives no engineering advice about protection settings and no radiation doses.

## Products

Templates for the Space Weather Prediction Center message (watch, warning, alert or summary), the CME arrival forecast and discussion, an ICAO space weather advisory, the grid operating procedure notice and operator log, GIC and reactive power status, the reliability coordinator's dissemination message, the post-event summary, GNSS timing and holdover status, satellite anomaly, safe-mode and customer notices, a precision agriculture guidance notice and an airline reroute notice. All are marked as exercise products. The ICAO layout follows the published example; check it against the current edition.

Charts, drawn from data and never from AI images, each with a text summary and a data table: Kp bars colored by G level (with the level words), X-ray flux with flare classes and R levels, proton flux with S levels, ground magnetometer, solar wind speed, neutral current at a transformer with operator actions, GNSS error with satellites tracked and holdover remaining, the G, S and R scale panel and an impact board. Levels are always words and numbers, never color alone.

## Replay a real storm

A replay uses the one-time fetch described in [Case data](case-data.md): you pick the storm and a place, you see the size of the download and the services first, and nothing is fetched until you agree. No account or key is needed.

- **The recent past (Space Weather Prediction Center data service):** planetary Kp, X-ray and proton flux, the satellite magnetometer, solar wind speed, and the alerts, watches and warnings list. These feeds hold about the last week.
- **Older storms (NOAA NCEI archive):** the daily planetary Kp by three-hour interval, flare counts and the daily geomagnetic forecast text, for any day from 2011. A day with no archived file is listed and never filled in.
- **Ground magnetometer (USGS observatory):** one-minute or hourly values of H, D, Z and F from the observatory nearest your place.

A short list of well-known storms (the May 2024 storm, the October 2024 storm and the March 2023 storm) points to dates; no data ships with the app. The finder can also search a period for storms by peak level. Real messages are kept as written, with their code and serial number, and are labeled historical.

## Simulate a storm

Give the time and class of a flare, the peak G and S levels and the speed of the CME. The simulation makes a flare, a proton event, a solar wind step at arrival, a Kp trajectory that peaks at the level you chose, a magnetometer disturbance, a neutral current from one stated relation and your ground conductivity factor, and the Space Weather Prediction Center messages in order: watch, warning, alert, summary. Add receivers (single-frequency, multi-frequency, or a GNSS-disciplined oscillator with its holdover in hours) to see GNSS error, satellites tracked, timing alarms and holdover remaining. Everything is labeled simulated. It is an illustration for exercises, not a prediction of any real transformer or receiver.

## Decisions and timing

Players record structured decisions: apply or end the operating procedure, tell the entities in the plan, take a grid action, switch a time source or declare holdover, stop or resume GNSS-guided work, reroute a flight, put a satellite in safe mode, notify customers, issue a public message. Each has a time and a stated basis.

The evaluation measures compare them with the clocks: the operating procedure applied before Kp reaches the condition, time source failover before holdover expires, safe mode before the proton flux threshold, whether messages from the utility, airline, telecom and public agree, and whether each entity named in your plan was told, with the time. The list of entities and the target are yours to set. The log helps with compliance evidence but does not replace an entity's own records.

## Reference library

The **Space weather reference library** pack (installed from the catalog) carries the NOAA Space Weather Scales and a USGS fact sheet on geomagnetic monitoring, both US government works. Other useful material could not be carried and is listed with links and the reason in the pack's README: the national strategy, action plan and benchmarks reports (their graphics are reserved to other holders), two further USGS fact sheets, the DHS Resilient PNT framework, the 2024 exercise report summary, and the NERC and ICAO documents, which are copyrighted.

## Limits

- Simulated series are illustrations, not NOAA products and not engineering data.
- Live data is never fetched during a session.
- Names of people, utilities, airlines and satellites in a scenario are fictional. A utility reliability engineer should review the procedures and examples before use.
