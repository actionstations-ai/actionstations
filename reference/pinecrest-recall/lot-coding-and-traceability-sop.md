# PFC-QA-03: Lot Coding and Traceability Records

Pinecrest Fresh Cut, LLC · Quality Assurance and Information Systems · Revision 6

## 1. Purpose

This procedure defines how every case Pinecrest ships is traceable from the field to the customer, and what the Traceability and Systems Lead must produce when FDA or a customer asks. It follows the structure of FDA's food traceability rule for foods on the Food Traceability List (leafy greens are on it): a traceability lot code, key data elements at critical tracking events, and records that can be produced as an electronic, sortable spreadsheet within 24 hours. Pinecrest runs its own 4-hour trace target.

## 2. Lot code format

The traceability lot code is printed on every case label, every bag and every pallet tag:

`PF<plant>-<yy><ddd>-L<line>-<shift>`

- `PF1` is Plant 1, Salinas (the only plant).
- `yy` is the two-digit year and `ddd` the day of the year of the production date (27278 is October 5, 2027).
- `L2` is the line number (lines L1 to L4).
- `A` or `B` is the shift (A: 06:00 to 14:30, B: 14:30 to 23:00).

Example: `PF1-27278-L2-B`. A raw material lot from a grower is coded `FLD-<grower>-<ranch>-<block>-<yy><ddd>`, for example `FLD-SLG-R14-C-27277`, the Santa Lucia Growers Ranch 14 Block C lot harvested on October 4, 2027.

## 3. Critical tracking events and key data elements

| Event | Who records it | Key data elements (all with the lot code) |
|---|---|---|
| Receiving (field to plant) | Plant 1 receiving dock | Product, quantity and unit, lot code of the raw material, location of the grower, harvest date, receive date, grower's ship-from, reference document (harvest ticket) |
| Transformation (cutting, washing, packing) | MES at the plant | Input lot codes and quantities, new traceability lot code, output product, quantity, production date, location |
| Shipping from the plant | WMS at Plant 1 dock | Lot code, quantity and unit, product, ship date, ship-from location, ship-to location, reference document (bill of lading number) |
| Receiving at a DC | WMS at the DC | Lot code, quantity, product, receive date, receiving location, previous source, reference document |
| Shipping from a DC | WMS at the DC | Lot code, quantity and unit, ship date, ship-from location, ship-to customer and location, reference document |

The records are kept for two years.

## 4. Systems

- **Manufacturing execution system (MES):** records transformation, lot genealogy and holds. A hold in the MES blocks a lot from shipping and from being picked in the DCs within 10 minutes through the interface.
- **ERP:** orders, customers, the ship-to master list (the list of every ship-to location with address, receiving hours and contact).
- **Warehouse management systems (WMS):** one at each DC (Stockton, Phoenix and Dallas), plus the plant dock; interfaced to the ERP every 15 minutes.
- **Co-packer and distributor records:** Rivermark Kits (co-packer in Fresno) and Westline Foodservice (distributor) send receiving and shipping files weekly by EDI; for a recall they are asked for daily data. Rivermark's records are partly paper.
- **Label printers and barcode scanners** at every pack line; scan rates are about 99 percent, so about 1 percent of cases may need manual lot matching.

## 5. What the trace produces

The Traceability and Systems Lead produces one sortable spreadsheet with these columns: lot code, product, quantity and unit (cases), ship date, ship-from location, ship-to customer, ship-to location and address, reference document, and a status column (held, delivered, in transit, unknown). The sheet totals must equal the cases produced in the MES for the lot. Gaps are listed in a separate tab with the reason (paper record, scan failure, manual re-label). The sheet is reviewed by the Recall Coordinator before it is sent to FDA, the state or a customer.

## 6. Mock recalls

A mock recall is run every quarter. The last one traced 96 percent of 41,000 cases to the ship-to level in 3 hours 40 minutes and left 4 percent unmatched because Rivermark's receiving records were on paper; the corrective action to move Rivermark to electronic records was scheduled for the next quarter and is not complete. The target is 100 percent in 4 hours.

## 7. Production holds on a positive test

When a retained sample or an environmental sample is positive:

1. The Quality Manager notifies the Recall Coordinator at once.
2. The MES places a hold on the lot of the positive sample, the lots on the same line within 24 hours, and the raw material lot or lots that fed them.
3. Plant 1 stops the line, begins a sanitation and a verification swab series, and does not restart until three consecutive negative sets are in.
4. The Traceability and Systems Lead starts the trace without waiting for the confirmation test; the presumptive positive is treated as a signal.

## 8. Reports of lot data

A reconciliation table is kept for every incident: cases produced, shipped to each DC, shipped by each DC to each customer, held at each location, delivered to stores, returned, destroyed, unaccounted for. All counts in the hold notice, the recall letter, the press release and FDA submission come from this table and are checked against the MES before any release.
