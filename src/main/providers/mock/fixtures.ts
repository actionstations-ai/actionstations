// Canned, schema-valid outputs for every stage, flavored after reference/scenario-3.
// Used by the mock provider so the whole pipeline runs offline in tests and e2e.
import type { StageOutputSchemaName } from '@shared/schemas'

export const MOCK_FIXTURES: Record<StageOutputSchemaName, unknown> = {
  IdeasOutput: {
    ideas: [
      {
        title: 'Flight to Nowhere',
        hook: 'Gate assignments on the FIDS start drifting, then the PA announces Flight 666 to Purgatory.',
        threat: 'Compromised credential used to tamper with the AODB that feeds FIDS, BHS and PA.',
        systemsAffected: ['AODB', 'FIDS', 'BHS', 'PA'],
        sectionsExercised: ['C1'],
        difficulty: 'intermediate',
        whyItTeaches: 'Tests trust in data, the Ops-IT gap, and PIO rumor control.',
        suggestedRoles: ['Ops Director (IC)', 'IT Director', 'PIO', 'ASC', 'Airline Liaison'],
      },
      {
        title: 'Doors Wide Open',
        hook: 'PACS controllers fail unlocked during the morning push.',
        threat: 'Vendor remote-access session left open is used to push a malicious config.',
        systemsAffected: ['PACS'],
        sectionsExercised: ['C1'],
        difficulty: 'advanced',
        whyItTeaches: 'Forces the 15-minute cache window decision and physical door posting.',
        suggestedRoles: ['Ops Director (IC)', 'ASC', 'IT Director', 'PIO'],
      },
    ],
  },
  OverviewOutput: {
    title: 'Flight to Nowhere',
    subtitle: 'Data Integrity & FIDS',
    theme: 'Data Integrity, Public Trust, and Crowd Management.',
    threat: 'A malicious actor has gained access to the Airport Operational Database (AODB).',
    operationalImpact: 'Passengers are misinformed and directed to the wrong gates.',
    coreSectionsTested: [{ citation: 'C1', why: 'FIDS / BHS failure procedures' }],
    targetAudience: 'Airport Operations, IT/Cybersecurity, Public Safety, PIO',
    location: 'North Coast International Airport (NCIA)',
  },
  ObjectivesRolesOutput: {
    objectives: [
      { name: 'Communication', text: 'Coordinate public messaging across IT, Ops, and PIO.' },
      { name: 'Decision Making', text: 'Make the "Go Dark" decision on incomplete data.' },
      { name: 'Technical Analysis', text: 'Identify the root cause from provided logs.' },
    ],
    roles: [
      {
        key: 'ops',
        name: 'Ops Director (Incident Commander)',
        abbreviation: 'Ops',
        team: 'Team A',
        description: 'Manages the physical terminal.',
        standingOrders: ['If data conflicts with reality, trust reality.'],
      },
      {
        key: 'it',
        name: 'IT Director (Technical Lead)',
        abbreviation: 'IT',
        team: 'Team B',
        description: 'Manages investigation and restoration.',
        standingOrders: ['Preserve evidence.'],
      },
      {
        key: 'pio',
        name: 'Public Information Officer',
        abbreviation: 'PIO',
        team: 'Team C',
        description: 'Manages social media and press.',
        standingOrders: ['Do not confirm "cyber attack" until IT confirms.'],
      },
      {
        key: 'asc',
        name: 'Airport Security Coordinator',
        abbreviation: 'ASC',
        team: 'Team D',
        description: 'Monitors crowd and physical security.',
        standingOrders: ['Protect the sterile area.'],
      },
    ],
    criticalResources: [
      'FIDS Screens',
      'PA System',
      'Baggage System',
      'Website/App',
      'Passenger Mood',
    ],
  },
  PhasePlanOutput: {
    phases: [
      {
        title: 'The Glitch',
        goal: 'Test initial problem identification.',
        startTime: '0:00',
        endTime: '1:00',
        beats: ['wrong destination', 'noise ticket'],
      },
      {
        title: 'The Crisis',
        goal: 'Make business as usual impossible.',
        startTime: '1:00',
        endTime: '2:00',
        beats: ['time jump', 'red herring', 'misinformation'],
      },
      {
        title: 'Manual Mode',
        goal: 'Force the move to analog procedures.',
        startTime: '2:00',
        endTime: '3:00',
        beats: ['forensics', 'go dark decision'],
      },
      {
        title: 'Recovery & Verification',
        goal: 'Trust the data again.',
        startTime: '3:00',
        endTime: '4:00',
        beats: ['restore', 'tech hurdle', 'ENDEX'],
      },
    ],
  },
  MselPhaseOutput: {
    rows: [
      {
        id: 'I-01',
        time: '0:15',
        from: 'Airline Rep',
        to: ['ops'],
        event: 'Phone Call: the gate screen shows the wrong destination.',
        expectedAction: 'Ops logs a ticket with IT.',
        purposeTag: 'CORE_NARRATIVE',
        format: 'phone_call',
        citations: ['C1'],
      },
      {
        id: 'I-02a',
        time: '0:20',
        from: 'Helpdesk',
        to: ['it'],
        event: 'Ticket #4492: vending machines spitting cans.',
        expectedAction: 'IT deprioritizes.',
        purposeTag: 'NOISE',
        format: 'helpdesk_ticket',
        citations: [],
      },
      {
        id: 'I-03',
        time: '0:40',
        from: 'Social Media',
        to: ['pio'],
        event: 'Tweet: "Boards say Gate A1, app says A12."',
        expectedAction: 'PIO monitors sentiment.',
        purposeTag: 'PRESSURE',
        format: 'tweet',
        citations: [],
      },
      {
        id: 'I-04',
        time: '0:50',
        from: 'IT Helpdesk',
        to: ['it'],
        event: 'Ticket update: AODB source data changed.',
        expectedAction: 'IT investigates AODB logs.',
        purposeTag: 'CLUE',
        format: 'helpdesk_ticket',
        citations: ['C1'],
      },
    ],
  },
  InjectTextOutput: {
    type: 'helpdesk_ticket',
    title: 'Vending Machines in Concourse B',
    deliveryMode: 'hand_to_role',
    fields: {
      ticketNo: '4492',
      priority: 'Low',
      requester: 'Concourse B Maintenance',
      subject: 'Vending Machines in Concourse B',
      description:
        'The Coke machines at Gate B2 and B6 just spit out all their cans at once. Is this a cyber thing?',
      status: 'New',
      assignee: 'IT Helpdesk',
    },
    instructorNote: 'Noise inject; IT should triage it down.',
    citations: [],
  },
  MediaBriefOutput: { paths: ['template'] },
  HandbookOutput: {
    exerciseOverviewMd: 'Discussion-based TTX simulating a cyber-physical attack on FIDS.',
    roomSetupMd: 'U-shape tables. PIO at a separate rear table.',
    rulesOfPlayMd: 'The instructor is the SimCell and plays everyone else in the world.',
    simcellScripts: [
      {
        rolePlayed: 'FBI Cyber Task Force',
        trigger: 'Players call the FBI',
        hardQuestions: ['Do you have a PCAP capture?'],
        concessions: ['Will accept preserved logs.'],
      },
    ],
  },
  RubricOutput: {
    metrics: [
      {
        name: 'Operational Coordination',
        points: 30,
        fail: 'Kept bad data on screens.',
        pass: 'Delayed Go Dark until forced.',
        excellence: 'Manual ops plan before shutdown.',
        linkedInjectIds: ['I-01'],
        objectiveRefs: ['Decision Making'],
      },
      {
        name: 'Technical Competence',
        points: 30,
        fail: 'Rebooted the server, destroying evidence.',
        pass: 'Found the UPDATE but not the source IP.',
        excellence: 'Isolated the workstation and preserved logs.',
        linkedInjectIds: ['I-04'],
        objectiveRefs: ['Technical Analysis'],
      },
      {
        name: 'Public Communication',
        points: 20,
        fail: 'Silent or confirmed terrorism.',
        pass: 'Holding statements.',
        excellence: 'Actively countered misinformation.',
        linkedInjectIds: ['I-03'],
        objectiveRefs: ['Communication'],
      },
      {
        name: 'Use of Doctrine',
        points: 20,
        fail: 'Never opened the plans.',
        pass: 'Referenced plans with difficulty.',
        excellence: 'Cited specific sections.',
        linkedInjectIds: [],
        objectiveRefs: [],
      },
    ],
  },
  EegOutput: {
    objectiveCapabilities: [
      {
        objective: 'Communication',
        capabilities: [
          {
            capability: 'public_information_and_warning',
            why: 'Holding statements and rumor control across PIO, Ops and IT.',
          },
        ],
      },
      {
        objective: 'Decision Making',
        capabilities: [
          {
            capability: 'operational_coordination',
            why: 'The Go Dark call needs Ops and IT in one command structure.',
          },
          {
            capability: 'infrastructure_systems',
            why: 'Stabilizing FIDS, BHS and PA with manual workarounds.',
          },
        ],
      },
      {
        objective: 'Technical Analysis',
        capabilities: [
          { capability: 'cybersecurity', why: 'Finding and isolating the AODB compromise.' },
        ],
      },
    ],
    eegs: [
      {
        capability: 'public_information_and_warning',
        target:
          'The PIO issues plain-language holding statements through the PA, FIDS, social media and the website within minutes of the first misinformation.',
        criticalTasks: [
          {
            task: 'Use the PA system in plain language and social media to tell passengers what to do',
            citation: 'C1',
            expectedBy: 'pio',
            rowIds: ['I-04', 'I-06b', 'I-12'],
          },
          {
            task: 'Issue a holding statement before the first media deadline',
            citation: 'C1',
            expectedBy: 'pio',
            rowIds: ['I-12'],
          },
          {
            task: 'Correct the rumor of a physical threat with a factual update',
            citation: 'C1',
            expectedBy: 'pio',
            rowIds: ['I-06b'],
          },
        ],
      },
      {
        capability: 'operational_coordination',
        target:
          'Ops assumes Operational Incident Command, IT assumes Technical Incident Command, and the two decide the FIDS shutdown together.',
        criticalTasks: [
          {
            task: 'Assume Operational Incident Command and notify all tenants of the system failure',
            citation: 'C1',
            expectedBy: 'ops',
            rowIds: ['I-08', 'I-09'],
          },
          {
            task: 'Decide whether to take FIDS down and switch to manual information',
            citation: 'C1',
            expectedBy: 'ops',
            rowIds: ['I-09'],
          },
          {
            task: 'Activate manual and analog workarounds: whiteboards, bullhorns, gate announcements',
            citation: 'C1',
            expectedBy: 'ops',
            rowIds: ['I-10'],
          },
        ],
      },
      {
        capability: 'infrastructure_systems',
        target:
          'FIDS, BHS and PA are stabilized with manual procedures and restored from a clean backup only after verification.',
        criticalTasks: [
          {
            task: 'Activate manual baggage sort procedures when the BHS fails',
            citation: 'C1',
            expectedBy: 'ops',
            rowIds: ['I-07'],
          },
          {
            task: 'Begin recovery from backups on a clean system',
            citation: 'C1',
            expectedBy: 'it',
            rowIds: ['I-13'],
          },
          {
            task: 'Verify restored data before publishing it to the screens',
            citation: 'C1',
            expectedBy: 'ops',
            rowIds: ['I-14', 'I-15'],
          },
        ],
      },
      {
        capability: 'cybersecurity',
        target:
          'IT identifies the compromised workstation, isolates it and preserves evidence for the FBI Cyber Task Force.',
        criticalTasks: [
          {
            task: 'Identify and isolate the affected systems',
            citation: 'C1',
            expectedBy: 'it',
            rowIds: ['I-08b', 'I-09'],
          },
          {
            task: 'Notify the FBI Cyber Task Force and CISA',
            citation: 'C1',
            expectedBy: 'it',
            rowIds: ['I-09'],
          },
          {
            task: 'Preserve logs and the capture before any system is rebuilt',
            citation: 'C1',
            expectedBy: 'it',
            rowIds: ['I-08b', 'I-12c'],
          },
        ],
      },
    ],
  },
  BriefingOutput: {
    currentTime: '09:00 AM',
    weather: 'Clear, 65°F. Winds calm.',
    situationBriefMd: 'It is a busy Thursday morning. Passenger volume is 15% above average.',
    statusBoard: [
      { item: 'Terminal', status: 'Normal Operations' },
      { item: 'IT', status: 'Green / Normal' },
    ],
    anomalyMd: 'A gate agent reported the wrong destination on the gate screen.',
    missionMd: 'Maintain the safety and security of the traveling public.',
    teams: [
      {
        team: 'Team A: Airport Operations',
        roleKeys: ['ops'],
        responsibility: 'You own the physical reality.',
        standingOrders: ['Safety first.'],
      },
    ],
    rulesOfEngagement: [
      'Start and end all communications with "This is an exercise".',
      'Use "REAL WORLD – REAL WORLD" to stop the exercise.',
    ],
  },
  HotwashOutput: {
    method: '3up3down',
    methodDescription: 'Three things that went well, three that broke.',
    questions: [
      {
        topic: 'Trust',
        text: 'At what point did you stop trusting the screens?',
        objectiveRef: 'Decision Making',
      },
    ],
  },
  SitManOutput: {
    assumptions: [
      'The exercise is conducted in a no-fault learning environment.',
      'The scenario is plausible, and events occur as they are presented.',
      'Players respond in accordance with existing plans, policies and procedures.',
    ],
    artificialities: [
      'Time jumps move the clock forward between modules.',
      'The SimCell plays every agency and caller outside the room.',
    ],
    modules: [
      {
        phase: 1,
        narrativeMd:
          'It is 09:00 on a busy Thursday. A gate screen shows the wrong destination and the helpdesk queue is filling.',
        keyIssues: ['Is this a glitch or an incident?', 'Who owns the bad data on the screens?'],
        discussionQuestions: [
          {
            text: 'Operations: what would make you declare an incident now?',
            roleKeys: ['ops'],
            objectiveRef: 'Decision Making',
            citations: ['C1'],
          },
          {
            text: 'IT: which log tells you the source data changed?',
            roleKeys: ['it'],
            objectiveRef: 'Technical Analysis',
            citations: [],
          },
          {
            text: 'PIO: what do you tell passengers before you know the cause?',
            roleKeys: ['pio'],
            objectiveRef: 'Communication',
            citations: [],
          },
        ],
      },
      {
        phase: 2,
        narrativeMd:
          'It is 10:00. One flight in five on the main board shows the wrong time or gate, and the PA has started to speak for itself.',
        keyIssues: ['When do the screens go dark?', 'What does the public hear first?'],
        discussionQuestions: [
          {
            text: 'Operations: what would make you declare an incident now?',
            roleKeys: ['ops'],
            objectiveRef: 'Decision Making',
            citations: ['C1'],
          },
          {
            text: 'IT: which log tells you the source data changed?',
            roleKeys: ['it'],
            objectiveRef: 'Technical Analysis',
            citations: [],
          },
          {
            text: 'PIO: what do you tell passengers before you know the cause?',
            roleKeys: ['pio'],
            objectiveRef: 'Communication',
            citations: [],
          },
        ],
      },
      {
        phase: 3,
        narrativeMd:
          'It is 11:00. The screens are dark and the terminal runs on whiteboards and runners.',
        keyIssues: ['How is manual mode staffed and sustained?', 'Who confirms each gate change?'],
        discussionQuestions: [
          {
            text: 'Operations: what would make you declare an incident now?',
            roleKeys: ['ops'],
            objectiveRef: 'Decision Making',
            citations: ['C1'],
          },
          {
            text: 'IT: which log tells you the source data changed?',
            roleKeys: ['it'],
            objectiveRef: 'Technical Analysis',
            citations: [],
          },
          {
            text: 'PIO: what do you tell passengers before you know the cause?',
            roleKeys: ['pio'],
            objectiveRef: 'Communication',
            citations: [],
          },
        ],
      },
      {
        phase: 4,
        narrativeMd:
          'It is 12:00. A clean server is ready, but nobody yet trusts the data it shows.',
        keyIssues: ['What proves the data is clean?', 'Who signs off on returning to normal?'],
        discussionQuestions: [
          {
            text: 'Operations: what would make you declare an incident now?',
            roleKeys: ['ops'],
            objectiveRef: 'Decision Making',
            citations: ['C1'],
          },
          {
            text: 'IT: which log tells you the source data changed?',
            roleKeys: ['it'],
            objectiveRef: 'Technical Analysis',
            citations: [],
          },
          {
            text: 'PIO: what do you tell passengers before you know the cause?',
            roleKeys: ['pio'],
            objectiveRef: 'Communication',
            citations: [],
          },
        ],
      },
    ],
  },
  // The excerpt is a sentence of the e2e and test plan fixtures (a PIO release rule), so the
  // verbatim check passes against them (#431).
  RedlineOutput: {
    proposals: [
      {
        originalExcerpt: 'The PIO may release information after consulting the Incident Commander.',
        proposedText:
          'The PIO releases information after written approval from the Incident Commander or, when the Incident Commander is unavailable within 15 minutes, the Deputy Incident Commander.',
        rationale:
          'In the exercise the PIO waited 40 minutes for approval because no alternate was named. The change names an alternate approver and a time limit.',
      },
    ],
  },
  DrillStartexOutput: {
    situationMd:
      'The terminal is on manual procedures. The Incident Commander has confirmed the data error and the PIO is preparing the first public statement.',
  },
  CritiqueOutput: { issues: [], summary: 'No blocking issues found.' },
  // No verdicts and no quotes: the checker's own labels stand and plan conflicts stay
  // unconfirmed (a verdict without a verbatim quote is discarded, #423).
  GroundingVerifyOutput: { claims: [] },
  PlanConflictOutput: { verdict: 'unrelated', quoteA: '', quoteB: '', explanation: '' },
  // Evidence refs name the Scenario 3 fixture's rows and the facilitator notes a test writes
  // (note:I-06, note:I-09, note:general). The strength citing note:I-99 rests on nothing and
  // is dropped by the mapper (AAR_UNSUPPORTED_FINDING), so tests can see that path too.
  AarOutput: {
    executiveSummaryMd:
      'The exercise tested the response to manipulated flight information. Operations moved the terminal to manual procedures and the PIO held the public line; the hand-off between IT and Operations at the Go Dark decision took longer than TIRP 13.6 allows.',
    capabilities: [
      {
        capability: 'operational_coordination',
        proposedRating: 'S',
        ratingRationale:
          'Incident command was established and the Go Dark decision was taken, but the IT and Operations command posts worked apart for twenty minutes.',
        strengths: [
          {
            title: 'Incident command established early',
            analysisMd:
              'Operations assumed Operational Incident Command at the first confirmed data error and kept one log of decisions.',
            evidence: ['note:I-06', 'note:general'],
            citations: ['S1'],
          },
          {
            title: 'Unsupported finding',
            analysisMd: 'This finding cites a note that was never written.',
            evidence: ['note:I-99'],
            citations: [],
          },
        ],
        areasForImprovement: [
          {
            title: 'IT and Operations decided the Go Dark call apart',
            analysisMd:
              'The decision to silence the PA and take the FIDS dark was made in the IT room and reached Operations by hallway conversation, so gate agents heard two versions.',
            evidence: ['note:I-09'],
            citations: ['S1', 'C1'],
            recommendation:
              'Add the Go Dark decision to the TIRP 13.6 checklist as a joint Operations and IT call with one announcement channel.',
            correctiveActions: [
              {
                action:
                  'Revise TIRP 13.6 so the Go Dark decision is taken jointly and announced once',
                element: 'planning',
                ownerRole: 'ops-director',
              },
              {
                action: 'Run a 30-minute drill of the manual FIDS procedure each quarter',
                element: 'exercises',
                ownerRole: 'ops-director',
              },
            ],
          },
        ],
      },
      {
        capability: 'cybersecurity',
        ratingRationale: 'Not enough evidence: no observation or note covers this capability.',
        strengths: [],
        areasForImprovement: [],
      },
    ],
    participantFeedbackMd: '',
  },
}
