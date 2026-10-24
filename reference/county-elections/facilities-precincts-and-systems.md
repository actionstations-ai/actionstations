# Lisle County Board of Elections — Facilities, Precincts and Systems Description

Document Control Number: LCBOE-SYS-2026 · Revision 3.1 · Effective Date: 08/15/2026 · Maintained by: Marcus Bell (Deputy Director), Rohan Mehta (Elections IT Manager) and Carla Nunez (Voting Systems Manager)

> **EXERCISE MATERIAL — for training use.** Lisle County, the City of Carrow, the Lisle County Board of Elections, its people, polling locations, contests, telephone numbers, hostnames, addresses and identifiers are simulated. No real candidate, party or election result is depicted.

**Record of Revisions:** 3.0 — 06/15/2026 — All — Systems inventory for the incident response plan · 3.1 — 08/15/2026 — Sections 3, 4 — Polling Location 6 moved to Carrow Community Church; Precinct 207 added after the township split

**Handling:** Internal. Contains device serials, seal practices and hostnames.

## Table of Contents

Section 1 Overview · Section 2 Board Facilities · Section 3 Precincts and Polling Locations · Section 4 Districts and Ballot Styles · Section 5 Drop Box · Section 6 Voting Equipment · Section 7 Information Systems · Section 8 Staffing · Section 9 Partners

---

## SECTION 1: OVERVIEW

Lisle County has 81,200 registered voters. The Board has 11 full-time staff and about 40 seasonal staff in an election, and recruits about 290 poll workers for a general election. At the 2024 general election 34% of ballots were cast early in person, 21% by mail and 45% on Election Day.

## SECTION 2: BOARD FACILITIES

| Facility | Address | Use | Security |
|---|---|---|---|
| Board office and Early Vote Center | 18 South Market Street, Carrow | Administration, voter registration, Early Vote Center (ground floor, 16 check-in stations), mail ballot processing, Election Operations Center (conference room) | Badge access; cameras at entrances and the mail room; Sheriff's deputy during early voting hours |
| Warehouse and central count | 640 Industrial Parkway, Carrow | Equipment storage, logic and accuracy testing, count room with LCBOE-EMS01 and the DS850 | Two-person badge access to the count room; cameras recorded 90 days; seal logs |
| Alternate site | County Administration Building, 100 Court Street, Carrow, Room 210 | Alternate Early Vote Center or count room under COOP-DR-2 | County building security |

## SECTION 3: PRECINCTS AND POLLING LOCATIONS

Every precinct in Lisle County and its 2026 polling location:

| Polling Location | Site | Address | Precincts | Registered voters |
|---|---|---|---|---|
| Polling Location 1 | Carrow Public Library, Main Branch | 210 Elm Street, Carrow | Precinct 101, Precinct 102 | 6,940 |
| Polling Location 2 | First Lutheran Church hall | 45 Grant Avenue, Carrow | Precinct 103, Precinct 104 | 7,120 |
| Polling Location 3 | Carrow Senior Center | 300 Maple Drive, Carrow | Precinct 105, Precinct 106 | 6,480 |
| Polling Location 4 | Lincoln Elementary School gym | 820 North Street, Carrow | Precinct 107, Precinct 108 | 7,310 |
| Polling Location 5 | Carrow Fire Station 2 meeting room | 1500 East Main Street, Carrow | Precinct 109, Precinct 110 | 6,770 |
| Polling Location 6 | Carrow Community Church | 77 West Fourth Street, Carrow | Precinct 111, Precinct 112 | 6,050 |
| Polling Location 7 | Lisle County Fairgrounds, Floral Hall | 2200 Fair Road, Carrow | Precinct 201, Precinct 202 | 6,210 |
| Polling Location 8 | Brennock Township Hall | 5 Center Street, Brennock | Precinct 203, Precinct 204 | 5,890 |
| Polling Location 9 | Oakmere Village Hall | 12 Main Street, Oakmere | Precinct 205, Precinct 206 | 6,640 |
| Polling Location 10 | Tanner Township Community Center | 4100 County Road 14, Tanner Township | Precinct 207, Precinct 208 | 7,020 |
| Polling Location 11 | Fenwick Volunteer Fire Department | 9 Depot Street, Fenwick | Precinct 209, Precinct 210 | 6,330 |
| Polling Location 12 | Lisle Valley High School | 3000 Valley Road, Lisle Township | Precinct 211, Precinct 212 | 7,140 |

There are 24 precincts and 12 polling locations; no others. The previous Polling Location 6 site (Carrow Middle School) is not used in 2026; the relocation was mailed to voters in Precinct 111 and Precinct 112 in August.

## SECTION 4: DISTRICTS AND BALLOT STYLES

| District / contest | Precincts |
|---|---|
| Carrow City Council District 1 | Precinct 101, 102, 103 |
| Carrow City Council District 2 | Precinct 104, 105, 106 |
| Carrow City Council District 3 | Precinct 107, 108, 109 |
| Carrow City Council District 4 | Precinct 110, 111, 112 |
| Measure A (Lisle County library levy) | All precincts |
| Measure B (Carrow charter amendment) | Precincts 101–112 |

There are no other districts or measures on the 2026 ballot. Ballot styles: BS-01 to BS-04 for the four Carrow council districts and BS-05 for the townships.

## SECTION 5: DROP BOX

Drop Box 1 is outside the Board office at 18 South Market Street: a steel box bolted to a concrete pad, under camera coverage recorded 90 days, emptied daily by a bipartisan pair who log the seal number and ballot count on LCBOE-F-11. It is the only drop box in the county.

## SECTION 6: VOTING EQUIPMENT

| Equipment | Quantity | Identifiers | Use |
|---|---|---|---|
| ES&S DS200 precinct scanner | 26 (one per polling location, two for early voting, 12 spares) | DS200-0401 to DS200-0426 | Counting hand-marked and BMD ballots |
| ES&S ExpressVote ballot-marking device | 30 | BMD 1 to BMD 30 | Accessible voting; at least one per polling location and four at the Early Vote Center |
| ES&S DS850 central scanner | 1 | DS850-0012 | Mail and provisional ballots |
| Election management system | 1 server, 1 client | LCBOE-EMS01 | Ballot definition, media programming, tabulation; air-gapped |
| KnowInk Poll Pad electronic pollbooks | 64 | Pollbook 01 to Pollbook 64 | Check-in: 16 for early voting and 4 at each polling location |
| Ballot-on-demand printers | 2 | — | Early Vote Center ballots by style |

Seals are numbered (example: Seal A0048213) and logged at every transfer.

## SECTION 7: INFORMATION SYSTEMS

| System | Purpose | Host | Owner |
|---|---|---|---|
| Statewide voter registration database | Official statewide list; county records synchronize nightly | Ohio Secretary of State | Secretary of State; county users managed by Beth Saylor |
| VoterTrack (county voter registration system) | Registrations, mail ballot requests and issue, pollbook export | LCBOE-VR01 (application), LCBOE-SQL01 (database), county data center | Beth Saylor; Rohan Mehta |
| Pollbook build workstation | Builds and hashes Poll Pad data packages from the VoterTrack export | LCBOE-PB01 (not networked) | Carla Nunez |
| Mail ballot tracking notices | Text and email status notices to voters who sign up | Vendor service linked to VoterTrack | Doug Pruett |
| Results website | Unofficial results on election night | results.lislevotes.example (county web host); upload workstation LCBOE-ENR01 | Rohan Mehta |
| Board website | Voter information, polling location lookup, rumor vs. fact page | lislevotes.example | Jenna Whitlow |
| Email and files | Microsoft 365 (county tenant), file server LCBOE-FS01 | County | County IT |
| Phones | Main line 555-0141, hotline 555-0140 (8 lines) | County voice system | County IT |

Accounts: 14 staff accounts have edit rights in VoterTrack (Director, Deputy Director, VR Manager, three VR clerks including Nina Ruiz, Absentee Manager and two absentee clerks, five seasonal data-entry accounts enabled 10/01 to 11/20). All use a second factor by phone app push.

## SECTION 8: STAFFING

| Name | Title |
|---|---|
| Gwen Hartley | Director |
| Marcus Bell | Deputy Director |
| Rohan Mehta | Elections IT Manager |
| Carla Nunez | Voting Systems Manager |
| Beth Saylor | Voter Registration Manager |
| Nina Ruiz | Voter Registration Clerk |
| Doug Pruett | Absentee / Mail Ballot Manager |
| Alicia Grant | Poll Worker Coordinator |
| Jenna Whitlow | Communications Coordinator (PIO) |

## SECTION 9: PARTNERS

| Partner | Role |
|---|---|
| Ohio Secretary of State | Directives, statewide voter registration database, security support |
| Lisle County Sheriff's Office | Election liaison, deputies at the Early Vote Center, escorts |
| Lisle County IT | Network, email, identity, managed SOC |
| Lisle County EMA | Weather, generators, county EOC |
| Lisle County Prosecuting Attorney | Board counsel |
| CISA Region 5 | Election security advisor, assessments |
| FBI Cincinnati Field Office | Election crimes coordinator |
| U.S. Postal Service (Carrow post office) | Election mail |
