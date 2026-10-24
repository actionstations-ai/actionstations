# Airports

Domain pack for the operator of a commercial-service airport: a city or county aviation department, an airport authority, or a port authority that runs an airport. The operator holds a 14 CFR Part 139 certificate and a TSA-approved Airport Security Program (49 CFR 1542). Airlines, ground handlers, FBOs and concessions are outside parties, not the exercising organization.

Included with Action Stations and enabled by default. Turn it off on the Packs screen if you never exercise an airport; projects already on the domain keep working.

## What is in the pack

- **Domain profile `airport`:** runways, taxiways, gates and concourses as fact categories. Systems: AODB, FIDS, CUPPS/CUSS, IDMS badging, BHS SCADA, PACS, ALCMS, fuel farm SCADA, boarding bridges and UAS detection. Player roles: Operations, IT, PIO, Airport Security Coordinator, Airline Station Manager, Emergency Manager (AEP), ARFF Chief and Facilities.
- **Inject templates:** FIDS board and BHS SCADA screen.
- **Example:** North Coast International Airport (`airport-ncia`).

## Plans and clocks the profile knows

- **Airport Emergency Plan** (14 CFR 139.325; AC 150/5200-31C). Class I airports hold a full-scale AEP exercise at least once every 36 months. FAA CertAlert 21-04 asks for UAS response instructions in the AEP.
- **Airport Certification Manual**, NOTAM procedures (139.339; AC 150/5200-28G) and the **Safety Management System** (Part 139 subpart E; AC 150/5200-37A).
- **Airport Security Program** and its cybersecurity amendments are Sensitive Security Information; the pack uses public summaries only.
- **Accidents:** NTSB notification under 49 CFR 830.
- **Drones:** since 1 Jul 2026 (SAFER SKIES Act interim final rule, 6 CFR and 28 CFR part 124), certified state and local law-enforcement agencies may detect and mitigate credible UAS threats, alongside DOJ and DHS. The airport itself may still only detect and report.
- **Local plans:** the jurisdiction's EOP airport annex (FEMA CPG 101 v3.1).

## Further reading (not bundled)

These are copyrighted or not federal works, so the pack only names them:

- ACRP Report 140, _Guidebook on Best Practices for Airport Cybersecurity_ (National Academies): https://nap.nationalacademies.org/
- PARAS 0007, _Quick Guide for Airport Cybersecurity_ (National Safe Skies Alliance): https://sskies.org/
- NFPA 424, _Guide for Airport/Community Emergency Planning_: https://www.nfpa.org/
- ICAO Doc 9137 _Airport Services Manual_, Part 7: https://store.icao.int/
- Aviation ISAC: https://www.a-isac.com/

Facts were checked against public sources on 2026-10-24. Regulations, security directives and editions change; check before relying on a deadline.
