# NLTO-OP-31: Geomagnetic Disturbance Operating Procedure

Northern Lakes Transmission Operations (NLTO) · System Operations · Revision 7 · Effective November 2026

## 1. Purpose

This procedure sets out the actions the NLTO control room takes before and during a geomagnetic disturbance (GMD), the conditions at which each action is taken, and the condition at which the procedure ends. It satisfies the operating procedure required of a transmission operator under NERC reliability standard EOP-010 and uses the forecasts from the NOAA Space Weather Prediction Center (SWPC) and the reliability coordinator. It does not set protection settings and gives no engineering advice about equipment ratings.

## 2. The system in brief

NLTO operates 4,100 miles of 345 kV, 230 kV and 115 kV lines and 38 substations in northern Minnesota and Wisconsin. The system lies at a high geomagnetic latitude over resistive rock, where geomagnetically induced currents (GIC) in transformer neutrals are among the largest in the country. The system has 11 345/230 kV autotransformers, 9 of them fitted with neutral current (GIC) monitors that report to the control room every 10 seconds. The control center is at 700 Harbor View Drive, Duluth, Minnesota (24-hour phone 218-555-0120; backup center at Virginia, Minnesota).

## 3. Information received

The control room receives: SWPC watches, warnings and alerts (by email and by the SWPC website, with the control room's alarm set for any message code starting WATA, WARK, ALTK or WARSUD); the SWPC CME discussion; the real-time Kp estimate; the solar wind data; the reliability coordinator's GMD notice (see UMRC-SOP-12) and the GIC monitor readings. The shift supervisor logs each message with its code, time (UTC and Central) and the action taken.

Scale mapping for this procedure: G1 is Kp 5, G2 is Kp 6, G3 is Kp 7, G4 is Kp 8 (including 9 minus), G5 is Kp 9.

## 4. Conditions and actions

| Condition | Predetermined trigger | Actions |
|---|---|---|
| **Condition 1: Watch** | SWPC Geomagnetic Storm Watch for G3 or higher, or a CME discussion with an arrival window in the next 36 hours, or an RC notice | Shift supervisor tells the control room staff and the Manager on call. Review planned outages for the next 48 hours and identify those that can be rescheduled. Check that the GIC monitors report. Confirm the contact list for the 14 entities in Section 6. Check the spare transformer location. |
| **Condition 2: Warning** | SWPC K-index warning of Kp 6 or higher, or a sudden impulse, or Kp 6 observed | Defer all non-emergency switching and planned outages in the 345 kV system. Place the second shift supervisor and the reliability engineer in the control room. Bring reactive resources on line (the shunt capacitor banks at Iron Range and Hartley and the static var compensator at Cloquet) and confirm voltages are within the normal range. Notify the entities. |
| **Condition 3: Storm** | Kp 7 or higher observed or warned, or neutral current above 75 amperes at any monitored 345/230 kV transformer, or reactive power swing of more than 150 MVAR | Reduce transfers across the Arrowhead and the North Shore interfaces by 10 percent. Increase operating reserve by 200 MW. Hold all planned line outages. Cancel any switching to restore a line that tripped unless the reliability coordinator agrees. Notify the generator operators and large customers. Call hourly with the RC. |
| **Condition 4: Severe storm** | Kp 8 or higher, or neutral current above 150 amperes, or any transformer gas alarm | Reduce transfers by a further 10 percent, as agreed with the RC. Consider turning on additional generation near the load. Ask the state emergency management duty officer for a call. Keep the load-shed plan ready (NLTO-OP-12, separate from this procedure). |

Actions at a condition are taken before the condition is reached when SWPC's forecast gives lead time. A watch gives hours; a warning for Kp 7 may come 30 to 90 minutes before the Kp is observed. A sudden impulse tells the control room that the shock has arrived and the main storm may follow in minutes to hours.

## 5. Monitoring during the storm

The reliability engineer watches: neutral current (amperes) at each monitored transformer, reactive power at the three static var and capacitor sites, voltage at the 23 key buses, line loadings at the interfaces, transformer top-oil temperature and dissolved gas alarms where fitted, harmonics alarms, and relay misoperations. A transformer with a gas alarm or a hot-spot alarm above 105 degrees C is reported to the Manager on call, who decides with the transformer engineer whether to remove it from service. The control room does not change protection settings during a storm.

## 6. Entities told

NLTO tells these 14 entities when it applies the procedure and when it ends it, within 60 minutes of each: the reliability coordinator (UMRC), the six neighboring transmission operators, the three generator owners (Taconite Ridge Generating Station, Lake Superior Hydro and the Baraga Wind Farm), the Minnesota Department of Public Safety duty officer, the two large industrial customers (Mesabi Taconite Works and Duluth Harbor Terminal), the NLTO fiber and telecommunications timing team and the NLTO executive on call. The entity list is kept in the control room binder.

## 7. Time source

Substation clocks and phasor measurement units use GPS time. A geomagnetic storm of G4 or higher can degrade GNSS. NLTO has holdover clocks at 14 substations with 24 hours of holdover and a backup network time source over fiber at the control center. If the GPS time error alarm shows more than 1 microsecond error or loss of lock at 3 or more sites, the supervisor switches those sites to the network time source and declares holdover at the others, with the holdover hours expected, and logs the time.

## 8. Termination

The procedure is terminated when SWPC's warnings have expired, Kp has been 4 or lower for 3 consecutive hours, neutral currents at all monitored transformers have been below 25 amperes for 3 hours, and the RC agrees. The supervisor records the time, tells the 14 entities and restores the deferred outages in order of priority, with the reliability engineer's review of any transformer that had a gas alarm. A post-event summary is filed with the RC within 30 days.
