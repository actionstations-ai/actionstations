# Spec 0460: Animal health — animal disease response, veterinary and animal agriculture

Issue: #693 (epic) · Milestone: Backlog · Status: Draft · Depends on: #648 (toolkits, spec 0448) · Related: #690 (epidemiology, spec 0457), spec 0449 (weather), #687 (flooding) · Research: [docs/research/domains/animal_health.md](../research/domains/animal_health.md)

## Summary

Action Stations can exercise the people who respond to animal disease: state animal health officials and their staff, the federal veterinary service as an outside party, practicing veterinarians, diagnostic laboratories, producers and integrators, extension, veterinary schools, fairs and animal shelters. They work an outbreak of highly pathogenic avian influenza, African swine fever, foot-and-mouth disease or another foreign animal disease from suspicion to release, with the products and figures of the field: premises maps with infected, contact and at-risk designations, control areas and surveillance zones sized from the response plans, movement permits, sampling schedules, depopulation and disposal trackers, and the epidemic curve of confirmed premises. Disaster animal care (shelter evacuation, flooded farms, barn fires) is covered too. The data are simulated premises and spread or real flock detections replayed from public records, and decisions are scored on the clocks of the field: time to quarantine and zone set-up, depopulation within the plan's goal, premises sampled on schedule, and continuity of business for unaffected producers.

The domain extends `food_agriculture` (processors, recalls, food defense, which already carries a foreign animal disease seed and a quarantine order template) and `public_health` (zoonoses). Disease dynamics, curves, line lists and tracing networks come from the epidemiology toolkit (spec 0457); the **animal disease toolkit** adds premises, zones, permits and logistics, and is reused by food and agriculture, public health, emergency management, campuses with veterinary schools or farms, and the logistics toolkit (#695).

## Requirements

### User stories

- As a state veterinarian's training coordinator, I want a first-detection HPAI exercise that moves from a presumptive positive in a commercial flock through zones, permits and depopulation, in the structure of the federal Red Book, with the AAR formatted for HSEEP.
- As a poultry integrator's biosecurity manager, I want a control area drawn around an infected premises that includes my contract growers, and a permit decision for moving birds to processing.
- As a dairy producer cooperative, I want a milk testing scenario (positive silo result, herd-level testing, movement rules) and a continuity-of-business discussion.
- As an extension specialist, I want a county fair exercise with a suspected disease in the swine barn.
- As an emergency manager, I want a flood that strands livestock and floods a shelter, using the flooding and weather toolkits.
- As a veterinary school instructor, I want students to size zones, set sampling schedules and write a movement permit.

### Functional requirements

**Domain**

- **FR-1 Animal health domain.** An `animal_health` domain profile with the roles, systems, outside parties and phrasing in the dossier (sections 4–5), with variants for a state animal health agency, a commercial producer or integrator, a veterinary diagnostic laboratory, an extension or fair organization, and a disaster animal care program; aliases as listed. It extends `food_agriculture` and `public_health` by reference and suggests the animal disease, epidemiology, weather and flooding toolkits.
- **FR-2 Threat families and arcs.** Families: HPAI in poultry, HPAI in dairy cattle, African swine fever, foot-and-mouth disease, New World screwworm, virulent Newcastle disease, zoonotic spillover to workers, disaster animal care, and the shared service degradation family (case-management system outage, laboratory backlog, checkpoint staffing shortfall), using extensible families (spec 0448 FR-15). Phase arc: suspicion → presumptive positive → quarantine and zones → tracing and surveillance → depopulation and disposal → cleaning and release → recovery and trade.

**Animal disease toolkit: products**

- **FR-3 Products as templates.** Exact templates for: quarantine or hold order and control area notice (building on the existing `animal_health_quarantine_order`), movement permit request and decision, presumptive positive notice and confirmation, laboratory result sheet, premises investigation form, indemnity claim worksheet, depopulation and disposal plan page, situation report, producer letter, fair or show cancellation notice, consumer FAQ, worker health monitoring log, and press release. Existing ICS and social templates are reused by reference.
- **FR-4 Format rules and knowledge.** Generator knowledge and lint checks for the vocabulary and relations in the response plans: premises designations (infected, contact, suspect, at-risk, monitored, free, vaccinated) and the zones they sit in (infected zone, buffer zone, control area, surveillance zone, free area, containment and protection vaccination zones); the rule that only at-risk premises can become monitored premises; sampling frequencies by designation; the HPAI minimum sizes (3 km, 7 km and 10 km, with a surveillance zone at least 10 km wide); the stamping-out goal of 24 hours from a presumptive positive; and that a presumptive result at a network laboratory precedes confirmation at the national reference laboratory. Each rule is tagged with the plan and edition it comes from (HPAI Red Book, May 2017; FMD Red Book, October 2020) so a change in a newer edition is a data edit.

**Animal disease toolkit: figures**

- **FR-5 Figures.** Figure kinds (spec 0448 FR-4) for: premises map (fictional premises as points sized by head count and colored and shaped by designation, with zone rings and county and road base layers); premises table; movement control map (checkpoints, permitted routes, closed roads); depopulation and disposal tracker (status board with backlog and disposal site capacity); sampling schedule table by designation; epidemic curve of confirmed premises and tracing diagram (shared kinds from spec 0457); inundation overlay on premises for disaster scenarios (flooding toolkit). Each produces a text summary and data table (spec 0448 FR-5). None is an AI image; barn, flock or field photos stay AI or template photographic injects.

**Simulation**

- **FR-6 Zone calculator.** Given infected premises and plan parameters, compute zone and area geometry from the plan's minimum sizes (default HPAI 3/7/10 km and surveillance 10 km, FMD settings per the FMD plan), with a designer override and a record of the basis. The calculator shows the premises falling in each zone and their designation options.
- **FR-7 Simulated premises and spread.** Generate fictional premises for a county by species and size consistent with the county's farm inventory, and a stochastic spread over time by distance kernel and movement links (parameters in the scenario); produce infected premises over time, a tracing network and the confirmed-premises curve, using the epidemiology toolkit's tools at premises level. All labeled simulated; fictional farm names and locations only (project naming rule).
- **FR-8 Capacity model.** Depopulation crew capacity per day, method constraints, disposal site capacity and travel, producing a backlog and a time-to-complete per premises; and, for FMD scenarios where the exercise includes vaccination, vaccination team throughput with cold chain and chain-of-custody checkpoints. Simple queue models, labeled simulated.

**Data and replay**

- **FR-9 Replay connector.** With consent and a size estimate (spec 0448 FR-8): APHIS confirmations of HPAI in commercial and backyard flocks (county, flock type, birds affected, confirmation date) as an aggregate historical series and county map, labeled historical with source and retrieval date. Replay never shows or invents farm names or addresses; the premises in a scenario are fictional points the scenario places, and the real counts only set the pace and scale. Farm inventories by county (USDA statistics) scale the generated premises.

**Decisions and evaluation**

- **FR-10 Structured decisions.** Forms (spec 0448 FR-14): establish a quarantine or control area (draw or edit on the map, with basis), change a premises designation, issue or deny a movement permit (premises, species, destination, testing), set depopulation order and method priority, choose a disposal site, request federal resources, request emergency declaration, release a control area, and publish a producer or consumer notice. Decisions go to the session log and feed the metrics.
- **FR-11 Metrics.** Decision timing (spec 0448 FR-12) configured for: time from presumptive positive to quarantine and to control area set-up; **depopulation timing** against the plan's 24-hour goal (a threshold-timing metric on a per-premises basis); **surveillance on schedule** (premises sampled by the due date for their designation); **continuity of business** (permits decided within the designer's service target and the share of unaffected premises able to move product); **disposal backlog**; message consistency across state, industry and public health.
- **FR-12 Core capabilities.** EEGs for Operational Coordination, Public Information and Warning, Situational Assessment, Supply Chain Integrity and Security and Environmental Response/Health and Safety, with animal health critical tasks and a mapping to the 20 VS FAD PReP critical activities as the federal program frames them (names confirmed when building the pack). The AAR follows HSEEP, as the federal program does.

**Knowledge and reuse**

- **FR-13 Document library.** A public-domain library pack: the HPAI and FMD response plans (Red Books), FAD PReP manuals 1-0 to 6-0 (as dated on the APHIS page), the VS HSEEP guidance and AAR/IP template, and state playbooks that are public domain or openly licensed (each license and URL verified when building the pack; edition dates shown, since the Red Books carry 2017 and 2020 dates).
- **FR-14 Examples.** (1) First detection of HPAI in a commercial turkey complex in a fictional county: zones, permits, depopulation and a continuity-of-business discussion. (2) HPAI in dairy cattle: a positive milk silo result, herd-level testing and movement decisions for a fictional state. (3) A county fair swine barn with a suspected foreign animal disease. (4) A flood with livestock rescue and a shelter evacuation (weather and flooding toolkits).
- **FR-15 Reuse by other domains.** Suggested toolkit added to the food and agriculture, public health, municipal, campus and emergency communications profiles; the food and agriculture `animal_health_quarantine_order` template is shared, not copied.
- **FR-16 Guides.** User guides: reading the response plans' designations and zones, using the zone calculator, designing a continuity-of-business exercise, and the limits of simulated spread.

### Non-functional requirements

- **NFR-1 Cost:** only free public data; no keys.
- **NFR-2 Privacy:** connectors contact APHIS or statistics services only when the user fetches data for a scenario; no real premises, owners or addresses are used or created; nothing about the user's plans is sent.
- **NFR-3 Accessibility:** every figure has a text summary and data table; premises designations use shapes and labels as well as color; zone rings are described in text with distances.
- **NFR-4 Accuracy:** rules and numbers traced to the plan edition in the dossier; a review by a state veterinarian or animal health official and an extension specialist before release (owner to arrange, as in the epic); the plan editions are dated in the product, and the user is told to follow their own state plan.
- **NFR-5 Integrity:** historical detections are labeled with source and date; simulated spread is never presented as a forecast of a real outbreak.

### Out of scope

- A forecast or real risk model for any real outbreak, and live data during a session.
- Clinical veterinary care scenarios and animal treatment protocols.
- Implementing the federal incident reporting systems; templates are exercise products.
- Plant health and invasive species (a possible later toolkit).

## Design

- **Domain:** `packs/domains/animal_health.json` (bundled pack) with variants as role sets.
- **Toolkit:** `packs/toolkits/animal_disease/` (toolkit JSON, templates, knowledge fragments tagged with plan editions, lint rule configuration).
- **Figures:** `src/main/render/figures/animal/` (premises map, movement map, depopulation tracker, sampling schedule), using map overlays and status boards from spec 0448 and epi figures from spec 0457.
- **Simulation:** `src/main/toolkits/animal_disease/{zones,spread,capacity}.ts` (zone geometry with buffers on the map projection, stochastic spread seeded for reproducibility, queue model).
- **Connectors:** `src/main/toolkits/connectors/{aphis_hpai,nass}.ts` with an estimate, a fetch cropped to the scenario's state and dates, and recorded-response tests; hosts fixed in code.
- **Metrics:** `src/main/evaluation/metrics/{depop_timing,surveillance_on_schedule,continuity}.ts` beside shared metrics.

## Security and privacy

As spec 0448: fixed hosts, size limits, files only in the scenario folder, consent before fetching. Premises coordinates are fictional and generated; the replay path discards any location finer than county. Exports are marked as exercise material.

## Testing

Zone geometry tests (buffer distances on a projected map, a premises on the boundary, merging of overlapping control areas, minimum size rules); designation rule tests (monitored only from at-risk); sampling schedule tests against the FMD plan table; spread simulation tests (seeded runs, infection only within the kernel distance plus movement links); capacity model tests with worked examples; golden images for each figure; connector contract tests with recorded responses and opt-in live tests; lint tests; metric tests with worked examples; example projects generated end to end with the local model before release.

## Tasks

1. **#849** Animal health domain profile, variants, threat families and arcs (FR-1, FR-2).
2. **#852** Animal disease toolkit templates and format knowledge (FR-3, FR-4).
3. **#857** Premises, zone and movement figures (FR-5).
4. **#860** Zone calculator and simulated premises and spread (FR-6, FR-7).
5. **#862** Depopulation, disposal and vaccination capacity model (FR-8).
6. **#863** Flock and herd detection replay connector (FR-9).
7. **#864** Structured decisions (FR-10).
8. **#865** Metrics and core capabilities (FR-11, FR-12).
9. **#866** Document library pack (FR-13).
10. **#867** Examples, reuse in other domains and user guides (FR-14–FR-16).

## Open questions

- **Practitioner review.** Recommendation: a state veterinarian's office staff member or an APHIS emergency coordinator, and an extension specialist, review the templates, rules and examples before release.
- **Plan editions.** The HPAI Red Book is dated May 2017 and the FMD Red Book October 2020 (footer marked draft). Recommendation: store the edition on every rule and check the APHIS FAD PReP page at each release; do not claim a newer edition exists.
- **Milk testing rules.** The dairy movement rules changed during 2025–2026 and sources conflict on dates. Recommendation: generate dairy scenarios from the strategy's structure and require the designer to confirm current state rules.
- **Federal reporting duties.** The accredited veterinarian reporting rule (9 CFR 161.4) and indemnity rules (9 CFR part 53) are unverified in this research. Recommendation: verify before the templates cite them.
