# Data centers and IT services

Domain pack for managed service providers (MSP / MSSP), colocation and hosting providers, and enterprise data centers and IT operations groups. An MSP compromise reaches every customer through the RMM and remote-access tools; a colocation incident is usually about power, cooling or physical access.

Facts below were checked on 2026-10-24 for the research dossier (`docs/research/domains/data_center_it.md` in the Action Stations repository). Regulations change; re-check a deadline before an exercise depends on it.

## Plans the exercise should draw on

No single statute governs an MSP or a colocation provider. Its obligations come from contracts, its customers' regulators and attestation regimes.

- **Incident response plan and playbooks** (NIST SP 800-61 Rev. 3; required by SOC 2, ISO/IEC 27001, PCI DSS 12.10, FedRAMP and DFARS 252.204-7012): roles and severity matrix, notification tree, evidence handling, playbooks for ransomware, BEC, RMM compromise and insiders, customer and regulator notice templates.
- **Information system contingency plan / IT DR plan** (NIST SP 800-34 Rev. 1): BIA with RTO and RPO per service, recovery order, alternate site, restore procedure, testing.
- **Business continuity plan / COOP** (customer contracts; FEMA Continuity Guidance Circular for government tenants).
- **Cyber event recovery playbook** (NIST SP 800-184) and **ransomware playbook** (NIST IR 8374 Rev. 1; CISA #StopRansomware Guide).
- **Emergency operating procedures, MOPs and SOPs** for the critical facility: loss of utility, generator fail-to-start, UPS on battery, chiller trip, high temperature in a data hall, suppression discharge, EPO, fuel delivery.
- **Emergency Action Plan and Fire Prevention Plan** (OSHA 29 CFR 1910.38 / 1910.39).
- **SPCC plan** for generator fuel above 1,320 gallons of aboveground storage (40 CFR 112).
- **Customer communication / SLA plan**, **vendor risk register** and **data breach response plan**.

## Reporting deadlines

- **SEC Form 8-K Item 1.05**: four business days after a public-company provider determines an incident is material (Release 33-11216). Verified.
- **DFARS 252.204-7012(c)**: report a cyber incident affecting covered defense information to DoD through dibnet.dod.mil within 72 hours of discovery; preserve images for 90 days. Verified against eCFR.
- **FedRAMP Consolidated Rules for 2026, Incident Evaluation and Communication**: initial report by class and severity, from 15 minutes (Class D, PAIN-3 to 5) to 1 hour (Class C) and 6 hours (Classes A and B); ongoing reports every 3 hours to 1 business day; a final report 3 hours to 3 business days after recovery. Verified on the rule page.
- **Reg S-P (17 CFR 248.30)**: a service provider to a broker-dealer, adviser or investment company notifies the covered institution within 72 hours of becoming aware of a breach. Verified against eCFR.
- **HIPAA business associate (45 CFR 164.410)**: notify the covered entity without unreasonable delay and within 60 calendar days of discovery. Verified against eCFR.
- **FTC Safeguards Rule (16 CFR 314.4(j))**: a non-bank financial tenant notifies the FTC within 30 days of discovering an event affecting 500 or more consumers. Verified against eCFR.
- **CIRCIA**: 72 hours for a covered cyber incident and 24 hours after a ransom payment; the final rule was not published as of 2026-10-24, so it is not yet mandatory.
- **State breach laws**: timelines vary by state.

## Copyrighted references (named, not bundled)

- SOC 2 / Trust Services Criteria, AICPA: https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2
- Tier Classification System, Uptime Institute: https://uptimeinstitute.com/tiers; Annual Outage Analysis: https://uptimeinstitute.com/resources/research-and-reports
- NFPA 75, NFPA 76, NFPA 2001 and NFPA 70E, NFPA: https://www.nfpa.org/codes-and-standards
- ASHRAE TC 9.9 _Thermal Guidelines for Data Processing Environments_: https://www.ashrae.org/technical-resources/bookstore/datacom-series
- ANSI/TIA-942, TIA: https://tiaonline.org/products-and-services/tia942certification/
- ISO/IEC 27001:2022 and ISO/IEC 27035, ISO: https://www.iso.org/standard/27001
- Security Breach Notification Laws index, NCSL: https://www.ncsl.org/technology-and-communication/security-breach-notification-laws
