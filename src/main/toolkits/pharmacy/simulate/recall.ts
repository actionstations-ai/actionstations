// The recall model (spec 0463 FR-8, FR-11): a recall notice arrives for lots the pharmacy
// received; each lot balances (received = dispensed + on hand + returned) and the patients to
// contact follow from what was dispensed. Lots, products and counts are fictional and simulated.
import { z } from 'zod'

export const RecallLot = z
  .object({
    lot: z.string().min(1).max(30),
    expiration: z.string().max(10).default('2027-06'),
    received: z.number().int().min(0),
    dispensed: z.number().int().min(0),
    onHand: z.number().int().min(0),
    returned: z.number().int().min(0).default(0),
    where: z.string().max(120).default('Central pharmacy shelf'),
  })
  .refine((l) => l.dispensed + l.onHand + l.returned === l.received, {
    message: 'each lot must balance: received = dispensed + on hand + returned',
  })

export const RecallParams = z.object({
  startDate: z.iso.datetime().default('2026-11-05T21:30:00Z'),
  product: z
    .string()
    .min(1)
    .max(100)
    .default('Ondansetron injection, 4 mg/2 mL vial (fictional lots)'),
  lots: z
    .array(RecallLot)
    .min(1)
    .max(8)
    .default([
      {
        lot: 'EX-30417',
        expiration: '2027-06',
        received: 600,
        dispensed: 412,
        onHand: 188,
        returned: 0,
        where: 'Central pharmacy shelf C4; ED cabinet',
      },
      {
        lot: 'EX-30418',
        expiration: '2027-06',
        received: 400,
        dispensed: 355,
        onHand: 40,
        returned: 5,
        where: 'Surgical services cabinet',
      },
    ]),
  /** Share of dispensed units that reached a distinct patient to contact. */
  patientShare: z.number().min(0).max(1).default(0.85),
})
export type RecallParams = z.output<typeof RecallParams>

export interface RecallRun {
  totalOnHand: number
  totalDispensed: number
  patientsToContact: number
}

export function runRecall(p: RecallParams): RecallRun {
  const totalOnHand = p.lots.reduce((n, l) => n + l.onHand, 0)
  const totalDispensed = p.lots.reduce((n, l) => n + l.dispensed, 0)
  return {
    totalOnHand,
    totalDispensed,
    patientsToContact: Math.round(totalDispensed * p.patientShare),
  }
}
