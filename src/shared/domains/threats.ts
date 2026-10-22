// Threat families (ADR-0014): the kind of incident an exercise is about, with the phase arc
// the MSEL follows, the decision-point and clue vocabulary and the lint rules. The arc is
// still four phases by default (docs/04 §3), but its goals and beats come from the family: a
// drone incident is not "manual mode", a flood is not "forensics".
import { THREAT_FAMILY_IDS, type ThreatFamily, type ThreatFamilyId } from './schema'

const LE_COORDINATION =
  'law enforcement|police|sheriff|FAA|airspace|air traffic|FBI|counter-UAS|counter UAS|C-UAS|Remote ID|federal partners|jurisdiction'

export const THREAT_FAMILIES: readonly ThreatFamily[] = [
  {
    id: 'cyber',
    label: 'Cyber incident',
    description:
      'An IT compromise (credential theft, ransomware, data tampering, a vendor session) whose effects reach operations through the systems people rely on.',
    keywords: [
      'ransomware',
      'phishing',
      'malware',
      'credential',
      'cyber',
      'hack',
      'intrusion',
      'data integrity',
      'tamper',
      'breach',
      'vendor remote access',
      'vpn',
      'database',
      'network',
      'siem',
      'unauthorized',
      'unauthorised',
      'compromised',
      'remote session',
    ],
    phaseArc: [
      {
        title: 'The Glitch',
        goal: 'Ambiguity: a small anomaly through a mundane channel tests the reluctance to declare an incident.',
        beats: [
          'A front-line report of data that looks wrong, through an everyday channel (a call, a ticket, a radio check)',
          'An unrelated noise item the technical team must triage down',
          'A first helpdesk or system note that the source data itself changed',
        ],
      },
      {
        title: 'The Crisis',
        goal: 'Business as usual becomes impossible; a stakeholder forces an official incident declaration and unified command.',
        beats: [
          'Time jump: the impact has multiplied and the night/day shift cannot work normally',
          'A red herring that splits resources',
          'A visual confirmation for the whole room (a photo, a board, a screen)',
          'Misinformation hits the public-information role',
          'A clue reveals the vector; a partner or tenant forces the incident declaration',
        ],
      },
      {
        title: 'Manual Mode',
        goal: 'The forced transition from digital to analog procedures and the one high-consequence decision.',
        beats: [
          'Forensics gives the smoking gun (a log, a script, an unauthorized session)',
          'The decision point: isolate / shut down / go dark, with a cost on both sides',
          'Physical and safety consequences of the manual workaround (queues, doors, screening, crowds)',
          'Media pressure with a deadline',
        ],
      },
      {
        title: 'Recovery & Verification',
        goal: 'Trusting the data again: restoration claims are not restoration.',
        beats: [
          'A restoration claim and a partner demanding guarantees',
          'The verification-plan question (how do we know it is clean?)',
          'A technical hurdle that delays recovery',
          'Tedious reconciliation, then ENDEX',
        ],
      },
    ],
    decisionPointExamples: [
      'take the compromised system offline and run manually, or keep it up and accept wrong data',
      'disconnect from the vendor or the network and lose a capability, or stay connected',
      'pay or refuse a ransom demand',
      'wipe and restore now (destroying evidence) or preserve the machine for law enforcement',
    ],
    clueKinds:
      'a log line, a SIEM alert, a phishing email header, an unauthorized admin session, a script or file name, an odd outbound connection',
    hurdleKinds:
      'a backup that is not mounted or is also infected, a vendor who needs a ticket and a signed access request, a licence or certificate that expired, a restore that brings the problem back',
    keyCoordination: 'the law-enforcement / cyber task force contact and the system vendor',
    lint: { clueRequired: true, clueRole: 'technical' },
  },
  {
    id: 'cyber_physical',
    label: 'Cyber-physical incident',
    description:
      'A digital cause with a physical effect: an OT/ICS system (SCADA, PLCs, HMIs, AVL/CAD, building automation, access control) does something no one commanded, and the field disagrees with the screen.',
    keywords: [
      'scada',
      'plc',
      'hmi',
      'ot',
      'ics',
      'setpoint',
      'automation',
      'control system',
      'avl',
      'cad/avl',
      'signal',
      'interlock',
      'building automation',
      'bas',
      'pacs',
      'cyber-physical',
      'cyberphysical',
      'manual control',
      'uncommanded',
      'on their own',
      'on its own',
      'no one commanded',
      'rogue command',
    ],
    phaseArc: [
      {
        title: 'Something Is Off',
        goal: 'A physical symptom with a digital cause: the screen and the field disagree and nobody wants to say which one is wrong.',
        beats: [
          'A field report (an operator, a crew, a customer) that contradicts what the control system shows',
          'An unrelated noise item the technical team must triage down',
          'A first technical note that a value, setpoint or command changed without an operator action',
        ],
      },
      {
        title: 'Loss of Control',
        goal: 'Operators can no longer trust the automation; the effect spreads and the public notices.',
        beats: [
          'Time jump: more equipment misbehaves; the shift cannot run the process normally',
          'A red herring (a mechanical or weather explanation) that splits attention',
          'A visual confirmation for the whole room (an HMI screen, a photo from the field)',
          'The public and a partner agency notice; misinformation starts',
          'A clue points at the digital cause; the incident is declared',
        ],
      },
      {
        title: 'Manual Operation',
        goal: 'Fall back to local / manual control and make the one call that trades service for safety.',
        beats: [
          'Forensics or the vendor gives the smoking gun (a changed configuration, a remote session, a rogue command)',
          'The decision point: take the system off automation, stop the process or stop service, with a cost on both sides',
          'Life-safety and operational consequences of manual operation (staffing, slower service, interlocks bypassed)',
          'Media and regulator pressure with a deadline',
        ],
      },
      {
        title: 'Restoration & Verification',
        goal: 'Verify the physical state before trusting the digital one again.',
        beats: [
          'A restoration claim from IT or the vendor; operations demands field verification first',
          'A technical hurdle (a controller that will not take the clean image, a missing spare, a firmware mismatch)',
          'Regulator and partner notifications that the plan requires',
          'Phased return to automatic control, then ENDEX',
        ],
      },
    ],
    decisionPointExamples: [
      'take the control system off automation and run manually with fewer hands, or keep automation and risk a wrong command',
      'stop the process or service (buses pulled in, gates closed, water held) or keep running on data you cannot trust',
      'disconnect the vendor or the network link that may be the vector, losing remote support',
    ],
    clueKinds:
      'an HMI value that disagrees with a field gauge, an alarm log, a setpoint change with no operator, a remote session, a firmware or configuration change, a controller that rebooted',
    hurdleKinds:
      'a controller that cannot be re-imaged on site, a vendor who needs a signed access request, a spare that is the wrong revision, interlocks that must be re-tested before restart',
    keyCoordination:
      'the system vendor, the regulator the plan names, and the law-enforcement / cyber contact',
    lint: { clueRequired: true, clueRole: 'technical' },
  },
  {
    id: 'physical_security',
    label: 'Physical security incident',
    description:
      'Unauthorized access, an intruder, a threat against people or property: fences, doors, badges, cameras, guards and law enforcement.',
    keywords: [
      'intruder',
      'trespass',
      'breach of perimeter',
      'fence',
      'unauthorized access',
      'badge',
      'suspicious person',
      'suspicious package',
      'bomb threat',
      'active threat',
      'active shooter',
      'theft',
      'sabotage',
      'vandal',
      'physical security',
      'perimeter',
    ],
    phaseArc: [
      {
        title: 'The Anomaly',
        goal: 'An odd report that may be nothing: tests the reluctance to escalate and the discipline of checking.',
        beats: [
          'A report of something out of place (a door found unlocked, a cut fence, a badge used twice, a vehicle where it should not be)',
          'An unrelated noise item (a false alarm, a routine request) that competes for the same people',
          'A camera or access-log check that raises more questions than it answers',
        ],
      },
      {
        title: 'The Breach',
        goal: 'The incident is real: where is the person, what did they reach, and who is in charge.',
        beats: [
          'Time jump: the intrusion is confirmed and the subject is still unaccounted for',
          'A second, conflicting report (a red herring) that splits the search',
          'A visual confirmation for the room (a CCTV still, a photo)',
          'The public notices; a post or a reporter asks what is happening',
          'Law enforcement arrives and asks who owns the scene',
        ],
      },
      {
        title: 'Containment',
        goal: 'The one call that trades operations for safety, and the handoff to law enforcement done right.',
        beats: [
          'The decision point: lock down, evacuate or shelter a part of the facility, or keep operating with a search under way',
          'Evidence preservation (do not touch, do not reset, do not overwrite the recorder)',
          'Crowd, tenant and partner friction caused by the containment',
          'Media pressure with a deadline',
        ],
      },
      {
        title: 'Recovery & Return',
        goal: 'All-clear criteria, re-screening and the return to normal are decisions too.',
        beats: [
          'An all-clear request that is premature',
          'A hurdle (a damaged door, a camera recorder that was overwritten, a badge system that needs a reset)',
          'Re-screening / repopulation in order',
          'Notifications the plan requires, then ENDEX',
        ],
      },
    ],
    decisionPointExamples: [
      'lock down or evacuate an area (stopping operations and moving people) or keep operating while the search continues',
      'hand the scene to law enforcement now (losing control of your own facility for hours) or keep managing it',
      'reset the access-control system to restore operations, destroying the evidence it holds',
    ],
    clueKinds:
      'a badge-reader log, a CCTV still, a cut fence or forced door, a witness description, a vehicle plate, a tailgating event',
    hurdleKinds:
      'a camera recorder that overwrote itself, a door that fails open, a guard post that is unstaffed, a lockdown that traps people who need to leave',
    keyCoordination: 'local law enforcement and the facility security authority the plan names',
    lint: { clueRequired: false, clueRole: 'security' },
  },
  {
    id: 'uas_drone',
    label: 'UAS / drone incident',
    description:
      'An unmanned aircraft over or near the facility: sighting, detection, operator location, the limits of what the organization may legally do, and coordination with the airspace authority and law enforcement.',
    keywords: [
      'drone',
      'uas',
      'uav',
      'unmanned',
      'quadcopter',
      'remote id',
      'counter-uas',
      'c-uas',
      'airspace',
      'overflight',
      'payload',
    ],
    phaseArc: [
      {
        title: 'The Sighting',
        goal: 'A report of a drone that may be authorized, a hobbyist or a threat: who owns the problem and how do you confirm it.',
        beats: [
          'A front-line report of a drone over a restricted or sensitive area, with a vague description',
          'An unrelated noise item that competes for the same people',
          'A first check: is a flight authorized or waivered, is there a detection system, what does it show',
        ],
      },
      {
        title: 'Persistent Incursion',
        goal: 'The drone returns or loiters; operations are affected and the legal limits of a response become real.',
        beats: [
          'Time jump: the drone is back (or a second one); work or traffic in the area is held',
          'A red herring (a second sighting that turns out to be a bird, a balloon or an authorized flight)',
          'A detection or Remote ID readout for the room (track, altitude, serial, operator location estimate)',
          'The public is filming and posting; a reporter calls',
          'A reminder that interfering with the aircraft is not an option available to the organization',
        ],
      },
      {
        title: 'Decision & Coordination',
        goal: 'The one call that trades operations for safety and the coordination with the airspace authority and law enforcement.',
        beats: [
          'The decision point: halt or curtail operations in the affected area versus continue under the overflight, taken with law enforcement and the airspace authority',
          'Locating and contacting the operator; what law enforcement will and will not do',
          'A payload or crash concern that raises the stakes',
          'Media and partner pressure with a deadline',
        ],
      },
      {
        title: 'Resolution',
        goal: 'The drone departs or the operator is found; the evidence, the notifications and the restart are done right.',
        beats: [
          'The operator is located or the aircraft lands; evidence is handed to law enforcement',
          'A hurdle (a detection log that was not saved, a restart criterion no one wrote down)',
          'Required notifications and the incident report',
          'Operations resume in order, then ENDEX',
        ],
      },
    ],
    decisionPointExamples: [
      'halt operations in the overflown area (stopping service or work, moving people) or continue under the drone, coordinated with law enforcement and the airspace authority',
      'request a law-enforcement response to find the operator, knowing the organization itself may not interfere with the aircraft',
      'evacuate or shelter an area over a possible payload',
    ],
    clueKinds:
      'a Remote ID broadcast, a detection-system track, an operator location estimate, a witness photo, a repeated flight pattern, a social media post by the pilot',
    hurdleKinds:
      'a detection system that shows no track, no legal counter-UAS option, an operator in a public park beyond the fence, a restart with no written criteria',
    keyCoordination: 'local law enforcement and the airspace authority (the FAA or its equivalent)',
    lint: {
      clueRequired: false,
      clueRole: 'security',
      decisionMustMention: {
        pattern: LE_COORDINATION,
        description: 'coordination with law enforcement or the airspace authority',
      },
    },
  },
  {
    id: 'insider',
    label: 'Insider threat',
    description:
      'A trusted person (employee, contractor, vendor) misusing access: oddities first, then a pattern, then the decision to treat it as a crime scene rather than a tech ticket or an HR matter.',
    keywords: [
      'insider',
      'disgruntled',
      'employee',
      'contractor',
      'sabotage',
      'exfiltration',
      'after-hours',
      'misuse',
      'privileged user',
      'terminated',
    ],
    phaseArc: [
      {
        title: 'Oddities',
        goal: 'Small irregularities that look like HR or IT housekeeping: tests whether anyone connects them.',
        beats: [
          'An after-hours access, a file moved, a setting changed, reported as routine',
          'An unrelated noise item',
          'A manager mentions a disgruntled or departing employee in passing',
        ],
      },
      {
        title: 'The Pattern',
        goal: 'Logs, badges and cameras line up; a wrong suspect splits the team; HR and legal constraints bite.',
        beats: [
          'Time jump: a second and third irregularity, now with impact on operations',
          'A red herring suspect',
          'A badge or access log that correlates with the changes',
          'A rumor among staff and a post from the public',
          'HR or legal reminds the team what they may not do yet',
        ],
      },
      {
        title: 'Confrontation',
        goal: 'The decision to suspend access and preserve evidence, treating the workstation as a crime scene.',
        beats: [
          'The smoking gun (a command history, a copied archive, a camera still at the console)',
          "The decision point: suspend the person's access and involve law enforcement now, or watch and gather evidence while the risk continues",
          'Operational consequences of the suspension (a shift uncovered, a system nobody else knows)',
          'Media or union pressure with a deadline',
        ],
      },
      {
        title: 'Damage Control',
        goal: 'What did they take or change, and how do you know it is all.',
        beats: [
          'A scope question: what else did this account touch',
          'A hurdle (shared credentials, a backdoor account, a vendor login the person set up)',
          'Verification before trusting the changed systems again',
          'Notifications the plan requires, then ENDEX',
        ],
      },
    ],
    decisionPointExamples: [
      "suspend the suspect's access and involve law enforcement now (tipping them off, losing a key operator) or keep watching",
      'image the workstation for evidence (taking it offline) or keep it running for operations',
    ],
    clueKinds:
      'an after-hours badge event, a command or query history, a copied archive, a camera still at the console, a privileged login from an unusual place',
    hurdleKinds:
      'a shared or vendor account the person set up, a system only the suspect knows, an HR process that gates the suspension',
    keyCoordination: 'law enforcement, HR and legal counsel',
    lint: { clueRequired: true, clueRole: 'technical' },
  },
  {
    id: 'natural_hazard',
    label: 'Natural hazard',
    description:
      'A storm, flood, wildfire, earthquake or extreme heat/cold event: warning and pre-positioning, impact, the life-safety response and recovery.',
    keywords: [
      'flood',
      'storm',
      'hurricane',
      'tornado',
      'wildfire',
      'earthquake',
      'blizzard',
      'snow',
      'heat',
      'lightning',
      'weather',
      'inundation',
      'dam failure',
      'spillway',
      'natural hazard',
    ],
    phaseArc: [
      {
        title: 'The Watch',
        goal: 'A forecast or warning that is still uncertain: tests the willingness to pre-position and to act early.',
        beats: [
          'A weather or hazard warning from the authority the plan names',
          'An unrelated noise item',
          'A first question from staff or partners about whether to change the schedule',
        ],
      },
      {
        title: 'Impact',
        goal: 'The event hits: damage reports, strained communications and a public that wants answers.',
        beats: [
          'Time jump: the event is under way; first damage and injury reports',
          'A red herring report that turns out to be wrong',
          'A visual confirmation for the room (a photo from the field, a gauge reading)',
          'Social media and a reporter with a deadline',
          'A partner agency asks for resources or a decision',
        ],
      },
      {
        title: 'Response',
        goal: 'The life-safety decision and mutual aid.',
        beats: [
          'The decision point: evacuate, shelter in place or suspend operations, with a cost on both sides',
          'Mutual aid requested and received; who is in command',
          'Access and functional needs, stranded people, staff who cannot get in',
          'Public information with a deadline and a rumor to counter',
        ],
      },
      {
        title: 'Stabilization & Recovery',
        goal: 'Damage assessment, restoration priorities and the return to service.',
        beats: [
          'Damage assessment and restoration priorities',
          'A hurdle (a generator that fails, a road that stays closed, a supplier that cannot deliver)',
          'Partner and regulator notifications',
          'Phased return to normal operations, then ENDEX',
        ],
      },
    ],
    decisionPointExamples: [
      'evacuate or shelter people now (stopping operations, moving the vulnerable) or wait for a clearer forecast',
      'release or hold water, close or keep open a route, cancel or keep a service',
    ],
    clueKinds:
      'a gauge or sensor reading, a field report, a forecast update, a structural inspection note',
    hurdleKinds:
      'a generator that fails, a flooded access road, a communications outage, a supplier that cannot deliver, a shelter that is full',
    keyCoordination:
      'the county or city emergency management agency and the weather / hazard authority',
    lint: { clueRequired: false, clueRole: 'operations' },
  },
  {
    id: 'infrastructure_failure',
    label: 'Infrastructure failure',
    description:
      'A utility, network or equipment failure with no attacker: power, communications, water, a critical machine; the cascade through dependent systems and the continuity decision.',
    keywords: [
      'power outage',
      'outage',
      'generator',
      'failure',
      'cascade',
      'network outage',
      'communications failure',
      'equipment failure',
      'mechanical',
      'utility failure',
      'backup',
    ],
    phaseArc: [
      {
        title: 'Degradation',
        goal: 'Something degrades and the cause is unclear: tests monitoring and the first escalation.',
        beats: [
          'A report that a system or utility is degraded (slow, intermittent, low pressure, flickering)',
          'An unrelated noise item',
          'A first technical note that the backup did not take over as expected',
        ],
      },
      {
        title: 'Cascade',
        goal: 'Dependent systems fail and the backups do not hold.',
        beats: [
          'Time jump: the failure has spread to dependent systems',
          'A red herring (a suspected cyber cause, a weather explanation) that splits the team',
          'A visual confirmation for the room (a dark board, a status screen, a photo)',
          'The public notices; a post and a reporter',
          'The utility or vendor gives an estimate nobody believes',
        ],
      },
      {
        title: 'Continuity Decision',
        goal: 'Run degraded or stop: the one call, and the manual workarounds that follow it.',
        beats: [
          'The decision point: suspend or curtail service, or keep running on degraded systems',
          'Manual workarounds and the staffing they need',
          'Partner and tenant friction',
          'Media pressure with a deadline',
        ],
      },
      {
        title: 'Restoration',
        goal: 'Phased return with verification; the fix that creates a new problem.',
        beats: [
          'A restoration claim and the order in which things come back',
          'A hurdle (a component that fails again, a part that is days away)',
          'Verification before trusting the restored system',
          'Notifications and the after-action note, then ENDEX',
        ],
      },
    ],
    decisionPointExamples: [
      'suspend or curtail service (stranding people, losing revenue) or keep running on degraded systems with a safety risk',
      'switch to backup now (with a risk of a hard failure) or ride out the degradation',
    ],
    clueKinds:
      'a status screen, a maintenance log, a vendor note, an alarm history that shows what failed first',
    hurdleKinds:
      'a generator or UPS that fails under load, a spare that is the wrong part, a vendor hours away, a restoration that trips again',
    keyCoordination: 'the utility or vendor and the partner agencies that depend on the service',
    lint: { clueRequired: false, clueRole: 'operations' },
  },
  {
    id: 'mass_gathering',
    label: 'Mass gathering / crowd incident',
    description:
      'A crowd event that goes wrong: queues, density, a gate or system failure, medical emergencies, misinformation, and the decision to hold, pause, evacuate or stop admission.',
    keywords: [
      'crowd',
      'crush',
      'stampede',
      'queue',
      'event',
      'concert',
      'game day',
      'mass gathering',
      'admission',
      'turnstile',
      'ticketing',
      'capacity',
    ],
    phaseArc: [
      {
        title: 'Build-up',
        goal: 'The crowd arrives and early indicators appear: tests whether anyone reads them.',
        beats: [
          'A report of a queue backing up or a gate / ticketing problem',
          'An unrelated noise item',
          'A weather, transport or scheduling factor that will matter later',
        ],
      },
      {
        title: 'The Surge',
        goal: 'Density and pressure build; communications overload; the public narrates it live.',
        beats: [
          'Time jump: a density or pressure problem at a specific point',
          'A red herring report from another part of the venue',
          'A visual confirmation for the room (a CCTV still, a phone photo)',
          'Misinformation on social media and a reporter',
          'Medical calls start',
        ],
      },
      {
        title: 'Control Decision',
        goal: 'Hold, pause, stop admission or evacuate: the one call, with law enforcement and EMS.',
        beats: [
          'The decision point: stop admission, pause the event or evacuate an area, with a cost on both sides',
          'Law enforcement and EMS coordination; who is in command',
          'Partner and promoter friction',
          'Media pressure with a deadline',
        ],
      },
      {
        title: 'Dispersal & Recovery',
        goal: 'Orderly egress, reunification and the after-action.',
        beats: [
          'Managed egress and transport',
          'A hurdle (an exit that is blocked, a transport system that cannot cope)',
          'Reunification and injured-person tracking',
          'Notifications and the after-action note, then ENDEX',
        ],
      },
    ],
    decisionPointExamples: [
      'stop admission or pause the event (angering thousands, losing revenue) or let it continue with a density problem',
      'evacuate an area through a crowd that is already dense',
    ],
    clueKinds:
      'a CCTV still, a density count, a radio report from a specific gate or section, a medical call cluster, a social media post with a location',
    hurdleKinds:
      'a blocked exit, a PA that cannot be heard, a transport system that cannot clear the crowd, a ticketing system that will not re-admit',
    keyCoordination: 'local law enforcement, EMS and the event promoter or tenant',
    lint: { clueRequired: false, clueRole: 'security' },
  },
]

const byId = new Map(THREAT_FAMILIES.map((t) => [t.id, t]))

export function threatFamily(id: ThreatFamilyId): ThreatFamily {
  const t = byId.get(id)
  if (!t) throw new Error(`Unknown threat family ${id}`)
  return t
}

export const isThreatFamilyId = (v: unknown): v is ThreatFamilyId =>
  typeof v === 'string' && (THREAT_FAMILY_IDS as readonly string[]).includes(v)

/**
 * The threat family a free text (a brief, an idea's title/hook/threat) describes, chosen among
 * `allowed` by keyword hits; `fallback` when nothing matches. Deterministic, no model call.
 */
export function inferThreatFamily(
  text: string,
  allowed: readonly ThreatFamilyId[],
  fallback: ThreatFamilyId,
): ThreatFamilyId {
  const t = text.toLowerCase().replace(/\s+/g, ' ')
  const hit = (k: string): boolean =>
    new RegExp(`\\b${k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)
  let best: { id: ThreatFamilyId; score: number } | undefined
  for (const id of allowed) {
    const fam = byId.get(id)
    if (!fam) continue
    const score = fam.keywords.reduce((n, k) => n + (hit(k) ? 1 : 0), 0)
    if (score > 0 && (!best || score > best.score)) best = { id, score }
  }
  return best?.id ?? fallback
}
