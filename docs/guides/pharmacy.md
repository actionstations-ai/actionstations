# Pharmacy and drug supply

The pharmacy toolkit gives an exercise the work of the people who buy, prepare, verify and dispense medicines: a drug shortage and its allocation, a substitution that has to be checked, a work queue that grows when a claims system fails, a refrigerator that loses power, a controlled substance count that does not add up, and a recall that has to reach patients. It suits hospital pharmacy departments and their shortage teams, community and chain pharmacies, compounding services, vaccine programs at clinics and health departments, pharmacy schools, and any hospital exercise that needs the pharmacy represented.

Turn it on in the scenario's **Toolkits** tab (see [Toolkits](toolkits.md)). The app proposes it when the brief mentions a drug shortage, a recall, compounding, a freezer failure or a claims outage, and for the hospital, nursing, health informatics and public health kinds of organization. The **Pharmacy and pharmaceutical supply** kind of organization describes the pharmacy itself in four variants: a hospital pharmacy department, a community pharmacy, a sterile compounding service and a vaccine program. It repeats what a hospital exercise inherits, so a project can run on either.

Everything here is exercise content, not clinical or legal guidance. Every patient, organization, drug record, lot and registration number is fictional unless a dated FDA record is quoted as history. The toolkit never gives doses or drug interactions beyond what you wrote into the scenario.

## What it adds

- **Documents** the team works with: a drug shortage board, a shortage assessment (operational and therapeutic), an allocation and restriction memo with an interchange table and emergency approval, a substitution safety checklist, a queue report, an outage notice with a workaround sheet, a temperature log, a temperature excursion report with a viability decision, a controlled substance report, a theft or loss notice with a Form 106 worksheet, a recall notice with a response log by lot, a compounding batch record and a patient letter or call script.
- **Charts** drawn from data, never pictures from an image model: a cold chain chart with the labeled range in Celsius and Fahrenheit and excursions shaded and labeled, a days-on-hand projection under allocation scenarios, a queue age and count chart, a usage chart that compares one user's removals with peers by hour, a recall tracing diagram and an inventory chart against par.
- **Decisions** to record: set an allocation, approve a substitution, restrict use, source supply, hold or release a batch, quarantine product, make a viability decision, move product, start an investigation, notify, switch to a manual workflow and reassign staff.
- **Writing guidance and format checks.** Drafts are checked for NDC shape, Celsius and Fahrenheit pairs that agree (2 to 8 °C is 36 to 46 °F), days on hand equal to on hand divided by usage, excursion reports that state the minimum, maximum and time outside the range, concentrations written in one unit, recall lots that balance, and the controlled substance clocks. The writing guidance also carries the Drug Supply Chain Security Act steps for suspect product: quarantine while it is investigated with the manufacturer and, once it is found illegitimate, notice to FDA and to immediate trading partners within 24 hours.

## The shortage model

Days on hand is on hand divided by usage per day. An allocation lowers what the pharmacy serves, so it moves the projected stockout later and holds doses back now; the model shows that trade. Set the on-hand quantity, usage, deliveries and any allocation changes. The Evaluation tab reruns the model with the allocations your players recorded and compares the result with the same scenario left alone, with the doses held back by the allocation kept apart from the doses that could not be served because the stock was empty. Tiers are not modeled separately.

## Replaying FDA shortage records

You can fetch the FDA's shortage records for one drug name or one class. The app shows what it would fetch and how large it is, and only after you agree does it contact the FDA's open data service. No account or key is needed and nothing about your plans is sent.

Each record is shown as the FDA published it: status, availability, related information (which often holds an estimated recovery date), contact and dates, with the date you fetched it. A recovery date is an estimate. The service holds the current state of each record, so a fetch is a dated snapshot, not a past day's supply, and the FDA states that its data must not be used for medical decisions. The app builds a shortage board from the records and your own fictional stock and usage, and says on the board which numbers are quoted. For a past shortage, use the dated narrative seeds below instead of pretending the records show that day.

Real manufacturer names appear only as quotes of a dated record. The exercising organization stays fictional.

## Historical seeds

Four dated starting points carry only attributed facts and list what was not established: the 2024 IV fluid shortage after Hurricane Helene (a single plant, allocations, imports, substitutions), the 2024 claims outage after a cyberattack on a clearinghouse, a carboplatin injection shortage record, and a composite controlled substance case built on the federal regulation rather than on a real case. The writing model is told they are history and not to invent details as fact.

## Simulated cases

Every simulated set is labeled **simulated** and repeats exactly with the same seed.

| You want                                           | Use        | What you set                                                                                       |
| -------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| A shortage with a stockout date that moves         | Shortage   | Drug, on hand, usage, deliveries, allocation changes, days to model                                |
| A queue that grows when something fails            | Queue      | Arrivals per hour, surges, staff, minutes per item, target age of the oldest item, seed            |
| A refrigerator or freezer that fails               | Cold chain | Range, setpoint, room temperature, minute of failure and restore, door openings, products, seed    |
| One user who stands out from peers                 | Diversion  | Days, peers, how many times the peer median, float days, cabinet outage hours, discovery day, seed |
| A recall with lots to find and patients to contact | Recall     | Product, lots (received, dispensed, on hand, returned), share of dispensed units that are patients |

**Cold chain.** The unit holds its setpoint, then warms toward the room along a curve when cooling stops, with a short bump for each door opening, and cools again if cooling returns. Whether product is still usable comes from a table of fictional products (a highest temperature and the minutes above it the scenario allows). The table is yours to set; it is not manufacturer data and not guidance.

**Diversion.** Peers follow a daytime pattern; one fictional user code removes more and in the small hours, with an innocent explanation (a float assignment, a cabinet outage) accounting for part of the volume. The report says which part is explained and which is not. Users are presumed innocent, and a pattern in data is not proof.

## What the evaluation shows

Each measure shows its inputs and what it cannot tell, and says n/a when nothing was decided.

- **Patients affected by the shortage:** doses unmet with and without your decisions, held back by allocation, and not served because the stock was empty.
- **Safe substitutions:** approvals with a passed or failed checklist and any approval that led to a scripted error.
- **Cold chain response:** minutes from alarm to the first action, doses at risk, saved by a correct keep, discarded correctly, discarded though usable and kept though not usable.
- **Diversion handling:** the written notice to the DEA Field Division is due within one business day of discovering a theft or loss, and Form 106 electronically within 45 days (21 CFR 1301.76(b)). The measure counts weekends only and does not apply federal holidays, time zones or state rules. It states what the rule says and gives no legal advice.
- **Recall response:** minutes from the notice to quarantine and to the first notice to patients.
- **Queue response:** the age of the oldest item at the peak with and without your staffing decisions.
- **Message consistency** across the pharmacy, clinicians and patients.

## For hospital exercises

Tick the **Hospital annual exercise: pharmacy and drug supply** program exercise in Exercise details to group the after-action findings under six critical areas of the Joint Commission's emergency management standards: communications, staffing, patient care and clinical support, safety and security, resources and assets, and utilities. These are the names in the chapter as revised in 2022; the Joint Commission revises its text, so check your current edition. The record is an aid, not a compliance claim; your compliance office decides which exercise it satisfies.

## Reference documents

The separate **Pharmacy reference library** pack holds the federal regulation text for hospital pharmaceutical services (42 CFR 482.25) and for theft or loss of controlled substances (21 CFR 1301.76), CMS Appendix Z, the FEMA guidance on healthcare facilities and power outages, the CDC Vaccine Storage and Handling Toolkit, the ASPR TRACIE crisis standards of care considerations for pharmaceutical and supply shortages, and the ASHP Guidelines on Managing Drug Product Shortages, which carries ASHP's own terms. FDA recall pages, USP chapters and Joint Commission standards are linked: they are web pages or sold by subscription.

## Limits

- The models are teaching models, not forecasts, and are not calibrated to any drug, product or place.
- Allocation percentages, viability tables and substitution checks in examples are choices a scenario author makes. A director of pharmacy and, for cold chain, an immunization program coordinator should review them before use in training for real response.
- The pharmacy is not connected to any wholesaler, claims switch, cabinet or state monitoring program, and the app is not a formulary, a dosing reference or decision support.
- Recall replay from the FDA's enforcement reports is not available yet.
