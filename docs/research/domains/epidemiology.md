# Domain dossier: `epidemiology` (outbreak investigation and surveillance)

Research for the epidemiology epic (#690, spec 0457) and the toolkit framework (#648, spec 0448). Researched 2026-11-04. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

## 1. Scope

**Covers:** the people who detect, investigate and control disease outbreaks: state and local health department epidemiologists and communicable disease programs, infection preventionists in hospitals and long-term care, public health laboratories, school and campus health, and epidemiology and public health graduate programs. The existing `public_health` domain describes the health department as an agency (DOC activation, health orders, dispensing); this domain describes the analytic and investigative work inside it and inside hospitals, and extends `public_health` rather than replacing it.

**Exercise types this domain needs:**

- **Outbreak investigation:** a foodborne, respiratory, healthcare-associated or vaccine-preventable cluster worked from first report to control measures and communication, following the steps field epidemiologists use. CDC's Field Epidemiology Manual lists ten: prepare for field work; confirm the diagnosis; determine the existence of an outbreak; identify and count cases; tabulate and orient the data by time, place and person; consider whether control measures can be implemented now; develop and test hypotheses; plan systematic studies; implement and evaluate control and prevention measures; communicate findings **[V: CDC Field Epidemiology Manual, "Conducting a Field Investigation"]**.
- **Exposure notification:** a measles case on a flight, in an airport, a school or a hospital waiting room, with contact lists, exposure windows and post-exposure decisions.
- **Surveillance signal:** a wastewater, syndromic or laboratory signal that precedes clinical reports, and the decision to act on it.
- **Medical countermeasure dispensing:** throughput of a mass prophylaxis or vaccination site. The operational side stays in `public_health`; this domain adds the throughput model and metrics.
- **Healthcare-associated infection cluster:** infection prevention and the health department working one cluster together.
- **Surge in laboratory testing:** specimen volume, turnaround time and reference lab referral.

**Aliases:** epidemiologist, epi, disease investigator, communicable disease unit, infection prevention, infection control, IP, hospital epidemiology, public health lab, surveillance, contact tracing, outbreak response, field epidemiology, disease detective.

## 2. Requirements to exercise

- **CDC PHEP 2024-2028 cooperative agreement** (CDC-RFA-TU24-0137, performance period July 1, 2024 to June 30, 2029, 12-month budget periods) **[V: CDC PHEP fact sheet and Budget Period 1 page; exact period wording from search summaries of the fact sheet]**. Its **Exercise Framework** (supplemental guidance, April 2024) defines discussion-based exercises (seminars, workshops, tabletops, games) and operations-based exercises (drills, functional and full-scale exercises) and requires two tracks to be run in a progressive sequence: a **Biological Incident track** (Biological Incident 100, a discussion-based exercise on roles, functions and countermeasures in a large-scale biological incident including pandemic influenza; Biological Incident 200, a functional exercise on medical countermeasure dispensing and materiel management with laboratory participation) and a **Capstone track** (100, 200, 300 and 400, ending in a full-scale exercise on a jurisdictional priority risk) **[V: Exercise Framework Supplemental Guidance, read this session]**. Most listed exercises are required once during the period of performance; the Critical Contacts Drill (verify contact information and return notification to the CDC Emergency Operations Center within 60 minutes) occurs annually **[V]**. If the Capstone risk is biological, the Biological 200 exercise cannot replace Capstone 300 **[V]**.
- **After-action rule:** improvement plan data elements are submitted in CDC's Ready CAMP system no later than 90 days after completing discussion-based and operations-based exercises; the AAR and IP are submitted only if requested; AARs follow HSEEP, including an after-action meeting **[V]**. This is the strongest hook for the product: AAR and improvement plan output that maps to those data elements.
- The earlier 2019-2024 cycle used different rules and the exercise requirement was waived in some periods; do not apply it to the current cycle **[V, dated: search summary]**.
- Hospital infection prevention exercises are driven by CMS emergency preparedness (42 CFR 482.15) and accreditation, covered in the healthcare dossier **[V in fields catalog]**.

## 3. Organization and roles

Titles vary by jurisdiction **[U]**.

| Title                                                                 | Abbrev. | Team           | What they decide                                                                                                    |
| --------------------------------------------------------------------- | ------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| State Epidemiologist                                                  | SE      | State          | Outbreak declaration, case definition, requests for CDC Epi-Aid, data release                                       |
| Local Epidemiologist / Communicable Disease Lead                      | EPI     | Surveillance   | Case definitions in use, investigation priorities, exclusion of workers, contact categories                         |
| Disease Investigator / Contact Tracer                                 | DI      | Investigation  | Interview scripts, contact classification, follow-up schedule, escalation                                           |
| Data Analyst / Surveillance Epidemiologist                            | DATA    | Surveillance   | Line list structure, epi curve, rates, dashboards, what is reported publicly                                        |
| Public Health Laboratory Director                                     | LAB     | Laboratory     | Testing priorities, referral and confirmation, turnaround, specimen acceptance                                      |
| Environmental Health Specialist                                       | EH      | Investigation  | Food source inspection, trace-back, closures                                                                        |
| Infection Preventionist                                               | IP      | Hospital       | Isolation precautions, exposure assessment of staff and patients, unit closures, reporting to the health department |
| Hospital Epidemiologist / Infectious Disease MD                       | HE      | Hospital       | Clinical case review, treatment and prophylaxis guidance                                                            |
| Health Officer                                                        | HO      | Executive      | Isolation, quarantine and closure orders (in `public_health`)                                                       |
| Public Information Officer                                            | PIO     | Communications | Exposure notices, press, rumor control (in `public_health`)                                                         |
| Epidemiology graduate student / Epidemic Intelligence Service officer | EIS     | Field team     | Field investigation under supervision **[U: EIS roster practice]**                                                  |

**Outside parties:** CDC (Epi-Aid, Emergency Operations Center, Division of Foodborne, Waterborne and Environmental Diseases), neighboring jurisdictions, FDA and USDA FSIS for food, school districts and child care, airlines and airports (exposure notification), employers and congregate settings, clinicians, the press, advocacy groups, and the public on social media.

## 4. Systems and data

- Reportable disease surveillance and case management (state systems, CDC's NEDSS Base System), electronic laboratory reporting and case reporting, syndromic surveillance, immunization registries, genomic and molecular typing networks (such as PulseNet for foodborne pathogens) **[U: names confirmed in `public_health` and food dossiers only as examples]**.
- **Epi Info**, CDC's free outbreak tool for forms, line lists and analysis, public domain, Windows **[V: CDC pages; current version not confirmed]**.
- **Wastewater surveillance:** CDC's National Wastewater Surveillance System publishes weekly wastewater viral activity levels (WVAL) for SARS-CoV-2, influenza A and RSV by sampling location as a full historical series on data.cdc.gov (dataset `atcp-73re`), updated Fridays, license: U.S. government works; levels are very low, low, moderate, high, very high; results take about 5 to 7 days from sample collection; coverage is mostly municipal sewer systems **[V: data.gov catalog record and CDC wastewater page]**. CDC also reports measles, avian influenza A(H5) and mpox wastewater data by site and week **[V]**. Level cutoffs have changed between pages; read the CDC methodology page for the dataset version used **[V: conflicting pages seen]**.
- **National Notifiable Diseases Surveillance System (NNDSS):** weekly data (provisional) on data.cdc.gov, with older tables on CDC WONDER; the weekly tables moved in January 2025 **[V: CDC NNDSS pages]**.

## 5. Products (what injects look like)

| Product                                                                                | Render                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Epidemic curve (cases by onset date, with exposure and intervention markers)           | data figure                                       |
| Line list (de-identified, fictional patients)                                          | table figure, spreadsheet export                  |
| Attack-rate table, odds-ratio table by exposure                                        | table figure                                      |
| Spot map of cases                                                                      | map figure                                        |
| Contact tracing network (index case, contacts, status)                                 | network figure                                    |
| Wastewater concentration or WVAL series with threshold                                 | time-series figure                                |
| Laboratory surge board (specimens received, pending, positive, turnaround)             | status board                                      |
| Dispensing site throughput chart (arrivals, stations, queue)                           | time-series figure                                |
| Health alert (HAN-style), exposure notice, clinician fax, school letter, press release | text templates (several exist in `public_health`) |
| Case report form, outbreak questionnaire, ICS 201, situation report                    | text templates                                    |
| Pathogen fact sheet, isolation and quarantine guidance                                 | knowledge fragments, library documents            |
| Social posts, hotline call notes, emails                                               | existing templates                                |

## 6. Public-domain document candidates

CDC's Field Epidemiology Manual and Principles of Epidemiology self-study course **[V: exist at cdc.gov; license of each to confirm before bundling]**; CDC Epi Info documentation; CDC PHEP Exercise Framework supplemental guidance and the Public Health Preparedness Capabilities **[V]**; CSTE position statements for case definitions **[U: license and access]**; HSEEP. Federal works are public domain in the U.S.; check each file for third-party content **[U]**.

## 7. Free public data for replay and figures

| Data                                           | Source                                 | Notes                         |
| ---------------------------------------------- | -------------------------------------- | ----------------------------- |
| Wastewater viral activity levels, 3 pathogens  | data.cdc.gov `atcp-73re`               | weekly, full history **[V]**  |
| Weekly notifiable disease counts               | data.cdc.gov NNDSS Weekly Data         | provisional, by state **[V]** |
| Influenza and respiratory surveillance         | CDC FluView and respiratory dashboards | **[U: dataset ids]**          |
| Outbreak case counts for past events (measles) | CDC measles pages                      | **[U]**                       |
| Population by county                           | Census Bureau                          | **[U]**                       |

Real outbreak line lists are not public; replay uses published aggregate curves, and any line list is simulated and marked so.

## 8. Simulation (no real patients)

- **Compartment models:** SIR and SEIR with parameters (reproduction number, latent and infectious periods, vaccination coverage, intervention start), solved in app code with a simple numerical method; produce daily incidence, prevalence and the epi curve. Textbook models, standard in teaching **[U: no single citation needed; confirm formulas in the spec's test fixtures]**.
- **Common-source outbreak generator:** attendees at an event, an incubation distribution, onset times, attack rate by food item, producing a line list and the odds-ratio table that points to the vehicle.
- **Contact network generator:** households, workplaces, schools and a flight, with contact counts and reachability by day.
- **Wastewater generator:** a concentration series from case counts with shedding lag, noise and a threshold, consistent with the epi curve.
- **Dispensing throughput model:** arrivals, stations and service times.
- Everything is labeled simulated; characters and places are fictional (naming rule).

## 9. Evaluation

- **Timing:** time from first report to case definition, to outbreak declaration, to first control measure, and to public notice; each against a ground truth in the simulated case.
- **Contact tracing:** proportion of contacts reached within a target time (the target is set by the exercise designer, not a national standard) **[U: no verified national target]**.
- **Dispensing:** throughput against plan (people per hour) and time to open the site (Capability 8 objectives: determine strategy, receive, activate, dispense) **[V: PHEP Exercise Framework]**.
- **Message consistency** across health department, hospitals and schools (spec 0448 metric).
- **Core capabilities (HSEEP):** Public Health, Healthcare and Medical Services; Epidemiological Surveillance and Investigation; Public Information and Warning; Operational Coordination **[U: confirm names against the current National Preparedness Goal]**.
- **PHEP capabilities:** 13 Public Health Surveillance and Epidemiological Investigation, 12 Public Health Laboratory Testing, 11 Nonpharmaceutical Interventions, 8 and 9 for dispensing and materiel **[V: in `public_health` dossier]**.

## 10. Threat families and arcs

Foodborne outbreak, respiratory pathogen with community spread, vaccine-preventable exposure, healthcare-associated cluster, mass prophylaxis, surveillance signal, laboratory surge, and the shared **service degradation** family (surveillance system outage, laboratory reporting backlog, data breach of a contact list). Arc for an investigation: signal → verify → define cases → describe by time, place, person → hypothesis → control → communicate → close and after-action.

## 11. Reuse by other domains

Animal health (zoonoses; spec 0460) uses the curve, line list, network and compartment model. Research labs (spec 0466) use exposure follow-up. Hospitality and cruise (#703), humanitarian response (#702), schools and campuses, airports (exposure notifications), food and agriculture (traceback), healthcare and emergency communications use the curves and notices. Wastewater and curve figures also serve public information exercises.

## Expert review (2026-11-11)

A model-led expert review written from the standpoint of a state health department field epidemiologist and PHEP coordinator. It is not a review by a licensed or employed practitioner; a state epidemiologist and an infection preventionist should still look at the products before they are used to train staff.

**What was checked.** The domain profile (roles, outside parties, threat families and their arcs), the toolkit knowledge (glossary, product conventions, realism rules), the decision forms and measures, the PHEP exercise tags and capability mappings, the eight figure kinds (epidemic curve labelling in particular), the previews of the seven epidemiology templates (case report form, outbreak questionnaire, exposure notice, clinician health alert, school or employer letter, isolation and quarantine guidance, hotline notes) and the user guide.

**Sources.**

- CDC PHEP Notice of Funding Opportunity, Exercise Framework Supplemental Guidance, April 2024 (cdc.gov/orr, read as text): Biological Incident 100/200, Capstone 100-400, Critical Contacts Drill (60 minute target, alternating LRN-B and LRN-C, unannounced, Monday to Friday), improvement plan data in Ready CAMP within 90 days. All tags in the pack match.
- CDC Public Health Emergency Preparedness and Response Capabilities (2018) numbering for the capability mappings (8, 9, 11, 12, 13; 6; 4; 3).
- CSTE/NNDSS measles case definition (position statement 12-ID-07) as summarised by CDC and state manuals; a January 2026 CSTE operational note on epi-linked confirmation during community transmission was noted.
- CDC disease pages for the seven pathogen facts (norovirus with the FDA Food Code 48 hour return, nontyphoidal Salmonella, measles including post-exposure MMR in 72 hours and IG in 6 days and exclusion days 5 to 21, influenza, SARS-CoV-2, pertussis, Legionella). All values in the glossary agree.
- CDC Field Epidemiology Manual, chapter 3 (the ten investigation steps) and Principles of Epidemiology, lesson 6 (epidemic curve conventions: number of cases on the vertical axis, onset time on the horizontal axis).

**What changed and why.**

- The clinician health alert preview gave the measles case definition with an epidemiologic link as _probable_. Under the CSTE definition, a febrile rash illness with a direct epidemiologic link to a laboratory-confirmed case is _confirmed_; probable means the clinical picture with no epidemiologic link and no conclusive testing. The preview now says so (golden image regenerated), and the measles glossary line carries the rule so drafts do not repeat the error.
- The epidemic curve had no vertical axis title and its horizontal title read "Onset (UTC), 6-hour bins". A curve without "Number of cases" would be marked down in any epidemiology class. The figure now titles both axes ("Number of cases"; "Date of illness onset" or "Time of illness onset" with the interval), and a figure can name another unit: the animal disease toolkit's premises curve now reads "Number of premises" against "Estimated date of infection".
- Two glossary lines were shortened to stay inside the knowledge cap after the measles addition (SARS-CoV-2 wording; no fact changed).
- The user guide's epidemic curve description names both axes.

**Defaults.** Kept as set, with these reasons: contact reach target 24 hours (a common health department target for first contact attempt; designers should set their own), dispensing plan of 300 people per hour (a planning figure only, stated as the designer's), grace windows of 8 hours to a case definition, 12 hours to declaration and 24 hours to the first control measure and public notice (reasonable for a one-day tabletop; a longer exercise should widen them).

**Remaining caveats.**

- Day bins are cut at UTC midnight. For a local outbreak the date of a late-evening onset can shift by one day; scenario times should be entered so this does not matter, or the curve drawn in hour bins.
- The PHEP framework text is dated April 2024 and the capabilities document 2018; CDC may revise both during the period of performance.
- Measles epi-link confirmation has a 2026 optional CSTE variation for community transmission; a jurisdiction using it should edit the case definition in the alert.
