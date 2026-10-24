EXERCISE MATERIAL — for training use.

# Ridgeline Managed Services — Critical Facility and Incident Response Plan (excerpt)

## Sites

Ridgeline runs two sites, DC1 (primary) and DC2 (disaster recovery). Customer racks in DC1 are in Data Hall 1 and Data Hall 2. Cage 14 and Rack F12 belong to the largest healthcare tenant.

## Power and cooling

Utility power feeds MSB-1 through ATS-1 and ATS-2. Standby power comes from GEN-1, GEN-2 and GEN-3; UPS-1A and UPS-1B carry the IT load. Data Hall 2 is cooled by CRAH-07 and CRAH-08, with chillers CH-1 and CH-2 on the roof.

## Platform

The managed platform runs on Cluster PROD-01 (hosts esx-node-14 and esx-node-15) with backups on datastore DS-SAN-03. Major incidents are tracked as INC0012345-style records and emergency changes as CHG004411-style records.

## Notifications

Defense customers are reported to DoD through DIBNet within 72 hours; FedRAMP customers are reported under the FedRAMP incident rules. The General Counsel decides SEC disclosure.
