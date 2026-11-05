# Pharmacy and drug supply

Domain pack and toolkit for pharmacists and the people who depend on them: a hospital pharmacy department, a community pharmacy (chain or independent), a sterile compounding service and a vaccine program with its cold chain.

Included with Action Stations and enabled by default. Turn it off on the Packs screen if you never exercise drug supply; projects already on the domain keep working.

## What is in the pack

- **Domain profile `pharmacy`:** builds on the healthcare profile (outside parties, media and the regulation list are repeated, so a project can run on either) and adds four variants as role sets: hospital pharmacy (director of pharmacy, operations manager, buyer, clinical pharmacist, medication safety officer, informatics pharmacist, diversion specialist), community pharmacy (pharmacist-in-charge, staff pharmacist, technician, district manager), compounding (designated person, quality pharmacist) and vaccine program (vaccine coordinator, immunization program liaison, clinic manager).
- **Scenario families:** drug shortage and allocation, pharmacy systems outage, cold chain failure, controlled substance diversion, compounding error and drug recall. A hospital exercise can also use the natural hazard, cyber, infrastructure and mass gathering families.
- **Toolkit `pharmacy`:** the terms, product conventions and realism rules of drug supply, the advisors a facilitator can add, thirteen products rendered from templates (shortage board, shortage assessment, allocation memo, substitution safety checklist, queue report, outage notice, temperature log, excursion report, diversion report, loss notice and Form 106 worksheet, recall notice, compounding record, patient letter) and format checks: NDC shape, Celsius and Fahrenheit pairs, days on hand, excursion statistics, queue status, concentration units, lot balance and the notice timing for a controlled substance loss.

## Exercise content, not clinical or legal guidance

Every patient, organization, drug record, lot and registration number in an exercise is fictional unless a dated FDA record is quoted as history. The pack is for rehearsing decisions and teaching; it is not a drug reference, a dosing reference, decision support, or legal advice on controlled substance or compounding law. Viability answers and allocation percentages in the examples are the scenario author's choices.

## Further reading (not bundled)

- USP general chapters on compounding (797 and 800, sold by subscription): https://www.usp.org/
- FDA drug shortages: https://www.fda.gov/drugs/drug-safety-and-availability/drug-shortages
- DEA Diversion Control Division: https://www.deadiversion.usdoj.gov/

## Reference library

The separate **Pharmacy reference library** pack carries documents whose public-domain status was checked: the CFR text of 42 CFR 482.25 (hospital pharmaceutical services) and 21 CFR 1301.76 (theft or loss of controlled substances), CMS Appendix Z and the FEMA guidance on healthcare facilities and power outages. It also carries the CDC Vaccine Storage and Handling Toolkit (July 2026), the ASPR TRACIE crisis standards of care considerations for pharmaceutical and supply shortages, and the ASHP Guidelines on Managing Drug Product Shortages (under ASHP's terms, stated in its entry). FDA recall pages, USP chapters and Joint Commission standards are linked; the library README lists each with the reason.

## Replaying FDA shortage records

The connector **FDA drug shortage records (openFDA)** fetches the records for one drug name or class on request, after you see an estimate and agree. Each record is shown as the FDA published it, with the retrieval date, and the FDA's statement not to use the data for medical decisions travels with it. The database holds the current state of each record, so a fetch is a dated snapshot, not the state of supply on a past day.
