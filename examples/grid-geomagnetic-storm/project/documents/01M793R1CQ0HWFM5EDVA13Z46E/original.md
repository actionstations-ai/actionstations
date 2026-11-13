# UMRC-SOP-12: GMD Forecasting, Notification and Wide-Area Coordination

Upper Midwest Reliability Coordinator (UMRC) · Reliability Operations · Revision 5

## 1. Purpose

The Upper Midwest Reliability Coordinator (UMRC), in central Iowa (24-hour phone 515-555-0130), is the reliability coordinator for 41 transmission operators and 112 generator owners across eight states. This SOP gives the RC's steps for receiving space weather forecasts and passing them to its transmission operators (TOPs) and neighbors, as required by the NERC GMD standard, and for coordinating wide-area operations during a storm.

## 2. Roles

- **Shift Manager** (on duty: Hugo Villanueva for the day shift): decides the RC's GMD level.
- **RC Operations Director:** Marguerite Kaplan (515-555-0132).
- **GMD analyst:** a member of the engineering staff on call who interprets SWPC products and the real-time GIC and voltage data from the TOPs.
- **Communications:** the RC sends messages by its Notification System (an automated tool with email, phone and text), the RC hotline and the entity conference bridge.

## 3. Receiving forecasts

The RC receives SWPC products by email and by the SWPC website and a data feed: watches, warnings, alerts and summaries, plus the CME discussion and the real-time Kp. The Shift Manager checks the products every 30 minutes during a watch. The RC does not alter an SWPC message: it states the SWPC product, adds its own assessment (for example, whether the storm is expected to affect the RC's footprint more because of the ground conductivity of the Canadian Shield margin) and the actions asked of TOPs.

## 4. RC notification levels

| RC level | Trigger | Message |
|---|---|---|
| Information | SWPC Geomagnetic Storm Watch G1 or G2 | A notice to all TOPs: the watch, the days, the highest level, and "no action required beyond monitoring" |
| Alert | Watch G3 or higher, or a CME discussion with arrival in the next 36 hours | The watch, the expected arrival window with its uncertainty, a request that TOPs apply their GMD operating procedures at the first condition |
| Warning | K-index warning Kp 6 or higher, or a sudden impulse | The warning, the actions: apply the procedure's second condition; start hourly calls |
| Emergency | Kp 8 or higher, or two TOPs report neutral currents above their own thresholds, or voltage collapse risk | The wide-area plan: transfers across the RC's big interfaces and the generation redispatch, calls every 30 minutes |

Each message has a message code and a serial number, the time in UTC and Central, a statement of the potential duration (storms last from several hours to a day), and the next call time. The RC sends to the TOP, generator owner and neighbor lists within 15 minutes of receiving an SWPC product at its level.

## 5. Dissemination checks

For every message the Shift Manager confirms that each of the TOPs received it (by acknowledgment on the Notification System). Entities that do not acknowledge within 30 minutes are called. The RC logs: the entity, the time sent, the time acknowledged. TOPs also pass the message to their own listed entities; the RC asks each TOP to confirm the number of entities it told.

## 6. Wide-area operations

During a G3 or higher storm the RC runs a conference bridge every hour. Each TOP in the footprint reports: the condition under its procedure, the highest neutral current and where, the reactive reserves, any equipment loss, and the plan for the next hour. The GMD analyst compiles the reports into the wide-area picture. The RC may direct: a reduction of transfers across a named interface; generation redispatch; a change to the schedule of a planned outage; sharing of reactive reserves. The RC does not tell a TOP what to do to its protection settings. If two or more TOPs report equipment problems or voltage declines, the RC raises its level to Emergency and informs the state emergency management agencies in the footprint.

## 7. Neighbors and other sectors

The RC's neighboring reliability coordinators are told when the RC goes to Alert or higher. The RC also shares the GMD notice with the gas transmission pipeline control centers and the telecommunications operations center on its distribution list, which has timing equipment sensitive to GNSS interference. Satellite navigation (GNSS) degradation may last hours at G4 and days at G5; the RC reminds TOPs to check time sources and phasor data quality.

## 8. Ending and learning

The RC ends the warning when SWPC's warnings have expired and Kp has been 4 or lower for 3 hours and the TOPs agree. It then sends a termination message and a post-event data request; each TOP returns a short report with the highest neutral current, the actions it took and the times. The RC compiles a wide-area post-event summary within 30 days.
