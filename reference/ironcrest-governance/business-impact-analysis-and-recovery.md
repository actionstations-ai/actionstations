# ICM-BCM-02: Business Impact Analysis and Recovery Order

Ironcrest Machinery Corporation · Business Continuity Office · Revision 5

## 1. Purpose

This document records the business impact analysis (BIA) of Ironcrest's critical functions and the order in which they are recovered after a disruption, so the Crisis Management Team can compare the actual recovery with each function's recovery time objective (RTO). The Business Continuity Manager, Ravi Menon, owns it and reviews it every year; the last review was in September.

## 2. Terms

The maximum tolerable period of disruption (MTPD) is the time after which the impact is no longer acceptable. The RTO is the target for restoring the function to its minimum acceptable level, inside the MTPD. The recovery point objective (RPO) is the most data that may be lost. The minimum acceptable level of service (MASL) is the level at which the function counts as recovered.

## 3. Critical functions

| Function | System or site | RTO | RPO | MTPD | MASL |
|---|---|---|---|---|---|
| Plant control networks and machine controllers, Plants 1 to 3 | PLC networks, historians | 4 hours | 0 | 12 hours | Lines run in manual or local mode |
| Manufacturing execution system (MES) | Hosted in the Rockford data center; replicated to the Dubuque site | 8 hours | 15 minutes | 24 hours | Work orders and lot tracking for the three plants |
| ERP (orders, inventory, finance) | Cloud region Central US with a warm copy in a second region | 12 hours | 1 hour | 48 hours | Order entry, shipping, purchasing |
| Shipping and parts distribution (Joliet) | Warehouse management system, labels, carriers | 24 hours | 4 hours | 72 hours | Ship 60 percent of normal parts orders |
| Payroll and benefits | Outside payroll provider and the HR system | 48 hours | 24 hours | 7 days | Payroll on the regular cycle (next pay date is every second Friday) |
| Dealer and OEM portal | Web portal | 24 hours | 4 hours | 72 hours | Order status and parts lookup |
| Email and collaboration | Cloud suite | 8 hours | 1 hour | 24 hours | Email and voice for executives, plants and customer service |
| Treasury and cash management | Bank portals, treasury system | 12 hours | 1 hour | 48 hours | Payments to suppliers and payroll funding |
| Engineering design data (PLM) | Rockford data center | 72 hours | 24 hours | 10 days | Read access to released drawings |
| Financial close and reporting | ERP and consolidation | 5 days | 1 day | 14 days | Quarter close on schedule |

Recovery checkpoints used by the BCM in every event are at 4, 8, 12, 24, 48 and 72 hours after the disruption starts.

## 4. Recovery order

1. Safety and life safety at all sites (plant security, fire and gas systems are on separate networks and are not affected by IT failures, and are verified first).
2. Identity and the network core (directory, firewalls, remote access), because every later system depends on them.
3. Plant control networks, then MES.
4. ERP, then the warehouse system at Joliet, then the dealer portal.
5. Email and collaboration (if not first needed for coordination, the out-of-band messaging group is used).
6. Treasury, payroll, then PLM and financial close.

If ransomware is in the environment, nothing is restored from a backup until the forensic firm has said the backup is clean, and each restored system is rebuilt, not cleaned. The CISO signs each system's return.

## 5. Sites and dependencies

- **Plant 1, Rockford, Illinois**, 3,200 employees, three shifts, builds 38 percent of transmissions; has a data center with the MES and PLM servers. A fire or power loss triggers the plant emergency plan.
- **Plant 2, Beloit, Wisconsin**, 2,100 employees; hydraulic drives; depends on the MES for lot control.
- **Plant 3, Dubuque, Iowa**, 1,900 employees; transmissions and final assembly; hosts the replica of the MES and the secondary data center.
- **Parts Distribution Center, Joliet, Illinois**, 340 employees; ships 4,100 parts orders a day.
- **Headquarters, Rockford**, 1,100 employees.

Each plant carries 5 days of finished goods and 9 days of key purchased parts. A shutdown of all three plants for more than 5 days would begin to stop the production lines of the company's largest customers, which hold under 10 days of inventory.

## 6. Key suppliers and vendors

The company's cloud provider, the payroll provider (Northbridge Payroll, fictional), the outside data center and network carriers, the warehouse software vendor, the steel supplier, the forensic firm Blackwater Cyber and outside counsel Harrow Fenn LLP, and the cyber insurer (Blue Heron Mutual, fictional; limit 50 million dollars, retention 2 million) through the broker. Contact numbers are on the CMT contact sheet.

## 7. Recording recovery

The BCM keeps the recovery tracker: the time disruption began, the time each function reached its MASL, and the RTO. A function that misses its RTO is flagged for the CMT and its customers are told. The BCM reports hours of lost production by plant, with the cost estimate from the CFO.

## 8. Customers and communications

OEM customers receive a letter from the COO's office within 24 hours of any event that will delay shipments by more than 2 days. Employee messages come from the Chief Communications Officer and the CHRO; the employee hotline is (815) 555-0125. Plants send a daily status to the CMT at 07:00 and 15:00 Central.
