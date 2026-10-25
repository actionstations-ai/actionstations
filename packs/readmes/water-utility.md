# Water utilities

Domain pack for a city or regional drinking-water utility, and its wastewater side where it runs one: treatment plants, chemical feed, pump stations, tanks and pressure zones, SCADA, the lab, billing and AMI.

Included with Action Stations and enabled by default. Turn it off on the Packs screen if you never exercise a water utility; projects already on the domain keep working.

## What is in the pack

- **Domain profile `water_utility`:** plants, pump stations, tanks, pressure zones, filters, pumps, PLCs/RTUs and chemical feeds as fact categories. Systems: plant SCADA and historian, PLCs and booster-station HMIs, chemical feed, analyzers, VFDs, AMI and MDM, LIMS, CIS and the hydraulic model. Player roles: Water Operations, SCADA/IT, PIO, Water Quality, Security & Emergency Manager, Treatment Plant Superintendent, Distribution Superintendent and Customer Service.
- **Example:** City Water (`city-water`), four tabletops: chemical-feed setpoint tampering, ransomware reaching toward the control network, tampering at a storage standpipe, and a transmission-main break during a telemetry outage.

## Plans and clocks the profile knows

- **Risk and Resilience Assessment and Emergency Response Plan** (SDWA 1433, as amended by AWIA 2018), certified to EPA every five years.
- **Tier 1 public notice** (boil-water, do-not-drink) as soon as practical and **no later than 24 hours** after the system learns of the situation, with primacy-agency consultation within the same 24 hours (40 CFR 141.202).
- **Wastewater:** oral report within **24 hours** of noncompliance that may endanger health or the environment, written report within five days (40 CFR 122.41(l)(6)).
- **Chlorine or ammonia releases:** the National Response Center immediately (40 CFR 302.6), and the SERC and LEPC (40 CFR 355).
- **Cyber:** no sector-specific federal reporting mandate; voluntary reports go to CISA, the FBI, EPA and WaterISAC. EPA publishes a voluntary cybersecurity incident response plan template.

## Further reading (not bundled)

- ANSI/AWWA J100 (RAMCAP), AWWA G430 and G440: https://www.awwa.org
- WaterISAC 15 Security Fundamentals: https://www.waterisac.org

Facts were checked against public sources on 2026-10-24. Check the current rules before relying on a deadline.
