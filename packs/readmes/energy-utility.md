# Energy utilities

Domain pack for an electric utility: transmission and distribution, substations and feeders, a control center with EMS/SCADA and ADMS, field crews, customers and regulators.

Included with Action Stations and enabled by default. Turn it off on the Packs screen if you never exercise an electric utility; projects already on the domain keep working.

## What is in the pack

- **Domain profile `energy_utility`:** substations, feeders, breakers and RTUs/relays as fact categories. Systems: EMS/SCADA, ADMS/DERMS, substation RTUs and relays, ICCP, distribution automation, AMI, the backup control center, OMS and CIS. Player roles: System Operations, OT/IT Security, Communications, Corporate Security, Field Operations, CIP Senior Manager and Customer Operations.

## Plans and clocks the profile knows

- **NERC CIP-008-6:** a Cyber Security Incident Response Plan; notify E-ISAC and CISA within **one hour** of determining a Reportable Cyber Security Incident, and by the end of the next calendar day for an attempt to compromise.
- **DOE Form OE-417:** Emergency Alert within **one hour** for criteria 1 to 9 (among them a physical attack, a reportable cyber incident, firm load shed of 100 MW or more, a public appeal), Normal Report within six hours, final report within 72 hours.
- **NERC EOP-004-4:** event reports by the later of 24 hours or the end of the next business day.
- Emergency operations, system restoration and loss of the control center (NERC EOP-011, EOP-005, EOP-008), physical security of critical substations (CIP-014) and state PUC storm plans.

## Further reading (not bundled)

- NERC Reliability Standards (CIP, EOP): https://www.nerc.com/pa/Stand/Pages/default.aspx
- APPA, NRECA and EEI guides (trade associations).

Facts were checked against public sources on 2026-10-24. Check the current standards before relying on a deadline.
