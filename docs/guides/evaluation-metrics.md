# Evaluation metrics

Some exercises have a right answer you can measure: a warning issued before a tornado touched down, an evacuation ordered before the winds arrived, two agencies telling the public the same thing. Field metrics score those against what actually happened (or what the scenario said would happen) and show the numbers with the inputs behind them. The results appear on the **Evaluation** tab in Facilitate and in a **Field Metrics** section of the after-action report.

Metrics are chosen by a toolkit or by your scenario settings; you do not write them. They score decisions and messages by the group, never a person.

## Decision timing

Compares the decisions your players made with a list of real or simulated events, the way a weather service checks its warnings.

- A decision **matches** an event when it is one of the decision kinds you named, it was made no more than the **lead window** before the event (default 120 minutes) or no more than the **grace window** after it began (default none), and, if area matching is on, the areas agree. A decision or event with no area matches any area.
- An event with a matching decision is a **hit**; without one it is a **miss**. A decision that matches no event is a **false alarm**. One decision can cover several events.
- **POD** (probability of detection) is hits divided by hits plus misses. **FAR** (false alarm ratio) is false alarms divided by hits plus false alarms. **CSI** (critical success index) is hits divided by hits, misses and false alarms. A ratio with nothing to divide by reads n/a.
- **Lead time** is how long before the event the earliest matching decision was made, per event and as a mean over hits. A decision made after the event began has a negative lead time.

Lead time is measured on hits only. A warning that never verified is a false alarm; it raises FAR and lowers CSI but does not change lead time, so read lead time together with FAR.

### Warning verification (weather toolkit)

With the weather toolkit on, decision timing is set up for warnings: the decisions counted are the warnings your players issue, a warning counts for an event up to 45 minutes before it, and the events are the storm reports of the real or simulated storm. A warning that precedes a report is a hit, a report with no warning before it is a miss, and a warning with no report in its window is a false alarm.

Two things to keep in mind when you read the result:

- **Lead time is measured from the earliest warning that matches each report**, and only for hits. A warning that never verified raises the false alarm ratio and lowers CSI but leaves lead time alone, so read the lead time together with the false alarm ratio.
- **The match does not use the warning polygon.** It uses the time window (and the area names, when your decisions carry them). A warning drawn in the wrong place still counts when a report falls in its window, so use the event table to check the places.

## Threshold timing

Compares an action with the time a measured or modeled quantity crossed a threshold, for each zone: for example, the start of an evacuation against the arrival of tropical-storm-force winds, less the time the evacuation needs.

- You set the quantity's threshold, the action (such as an evacuation order) and the **clearance time**: how long the action needs to finish before the threshold is crossed. A zone can have its own clearance time.
- The crossing time is found in the zone's series, interpolated between samples. The **action needed by** time is the crossing minus the clearance time.
- The **margin** is how much earlier than that deadline the action was taken. Zero or more is on time; negative is late. A zone with no action reads "No action taken", and one whose series never reached the threshold reads "Threshold never crossed". A decision with no area counts for every zone.

The result is only as good as the series behind it. The inputs list says which one was used.

## Protection coverage

Checks how many of the places the modeled hazard reaches had a protective action in time: for an oil spill, the share of the sensitive areas that had boom, a closed intake or a closure before the oil arrived.

- Each area has a modeled series. Its **landfall** is the first time the series reaches the threshold; areas the hazard never reaches are left out.
- An area counts as **protected in time** when a decision of one of the protective kinds names that area and was made at least the **clearance time** before landfall. One made later reads "Protected too late"; none reads "No protective action".
- A decision that does not name an area protects nothing: protection is a place.
- The summary gives the share protected in time, with the count behind it.

## Message consistency

Checks whether partners told the same story on the key facts: landfall time, evacuation zones, shelter locations, a hotline number.

1. List the key facts.
2. For each partner, enter the value their message states for each fact.
3. The comparison is exact after trimming spaces, ignoring case and ending punctuation. Numbers can match within a tolerance you set (for example 0.5 feet). "2pm" and "14:00" count as different until you enter them the same way.

Each fact reads Consistent, Conflict, Only one partner stated it, or Not stated, and the score is consistent facts divided by facts that more than one partner stated. If you list the partners you expect, anyone missing from a fact is named.

A model can optionally read the messages and propose values. This uses the text model your project routes evaluation to, and a hosted model shows the usual preview of what is sent and asks for approval first. Suggestions are marked and do not count until you confirm each one, and the result says how many were left out.

## Where results appear

Results are saved with the exercise, so the same numbers show on the Evaluation tab and in the report. Each result lists its **inputs** (how many events and decisions, the windows, the threshold, the clearance time), the numbers, a table per event, zone or fact, and notes on what limits the result. The report section sits between the findings and the improvement plan, and re-running a metric replaces its earlier result instead of adding a second copy.

## Where the inputs come from

- **Events and series** come from the scenario's case data: storm reports and observed river levels for a historical case, the scenario's own generated values for a simulated one. The report says which.
- **Decisions** come from the decisions recorded during live play and in Facilitate, with the time they were made.
- **Key facts and statements** are typed by the evaluator.
