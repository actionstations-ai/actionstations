// The 32 FEMA Core Capabilities of the National Preparedness Goal, second edition (2015), as
// data (#421). The list is public domain and static: it is never edited per project. Exercise
// objectives map onto capabilities, and each capability that is exercised gets an Exercise
// Evaluation Guide (EEG) whose critical tasks come from the organization's own plans.
import { z } from 'zod'

export const MISSION_AREAS = [
  'prevention',
  'protection',
  'mitigation',
  'response',
  'recovery',
] as const
export type MissionArea = (typeof MISSION_AREAS)[number]

export const MISSION_AREA_LABELS: Record<MissionArea, string> = {
  prevention: 'Prevention',
  protection: 'Protection',
  mitigation: 'Mitigation',
  response: 'Response',
  recovery: 'Recovery',
}

const ALL: readonly MissionArea[] = MISSION_AREAS

export interface CoreCapability {
  id: string
  name: string
  areas: readonly MissionArea[]
  /** The Goal's one-sentence description of the capability. */
  definition: string
}

export const CORE_CAPABILITIES = [
  {
    id: 'planning',
    name: 'Planning',
    areas: ALL,
    definition:
      'Conduct a systematic process engaging the whole community as appropriate in the development of executable strategic, operational, and/or tactical-level approaches to meet defined objectives.',
  },
  {
    id: 'public_information_and_warning',
    name: 'Public Information and Warning',
    areas: ALL,
    definition:
      'Deliver coordinated, prompt, reliable, and actionable information to the whole community through the use of clear, consistent, accessible, and culturally and linguistically appropriate methods to effectively relay information regarding any threat or hazard, as well as the actions being taken and the assistance being made available, as appropriate.',
  },
  {
    id: 'operational_coordination',
    name: 'Operational Coordination',
    areas: ALL,
    definition:
      'Establish and maintain a unified and coordinated operational structure and process that appropriately integrates all critical stakeholders and supports the execution of core capabilities.',
  },
  {
    id: 'forensics_and_attribution',
    name: 'Forensics and Attribution',
    areas: ['prevention'],
    definition:
      'Conduct forensic analysis and attribute terrorist acts (including the means and methods of terrorism) to their source, to include forensic analysis as well as attribution for an attack and for the preparation for an attack in an effort to prevent initial or follow-on acts and/or swiftly develop counter-options.',
  },
  {
    id: 'intelligence_and_information_sharing',
    name: 'Intelligence and Information Sharing',
    areas: ['prevention', 'protection'],
    definition:
      'Provide timely, accurate, and actionable information resulting from the planning, direction, collection, exploitation, processing, analysis, production, dissemination, evaluation, and feedback of available information concerning physical and cyber threats, and exchange that intelligence, information, data, or knowledge among government or private sector entities, as appropriate.',
  },
  {
    id: 'interdiction_and_disruption',
    name: 'Interdiction and Disruption',
    areas: ['prevention', 'protection'],
    definition: 'Delay, divert, intercept, halt, apprehend, or secure threats and/or hazards.',
  },
  {
    id: 'screening_search_and_detection',
    name: 'Screening, Search, and Detection',
    areas: ['prevention', 'protection'],
    definition:
      'Identify, discover, or locate threats and/or hazards through active and passive surveillance and search procedures, which may include the use of systematic examinations and assessments, bio surveillance, sensor technologies, or physical investigation and intelligence.',
  },
  {
    id: 'access_control_and_identity_verification',
    name: 'Access Control and Identity Verification',
    areas: ['protection'],
    definition:
      'Apply and support necessary physical, technological, and cyber measures to control admittance to critical locations and systems.',
  },
  {
    id: 'cybersecurity',
    name: 'Cybersecurity',
    areas: ['protection'],
    definition:
      'Protect (and, if needed, restore) electronic communications systems, information, and services from damage, unauthorized use, and exploitation.',
  },
  {
    id: 'physical_protective_measures',
    name: 'Physical Protective Measures',
    areas: ['protection'],
    definition:
      'Implement and maintain risk-informed countermeasures, and policies protecting people, borders, structures, materials, products, and systems associated with key operational activities and critical infrastructure sectors.',
  },
  {
    id: 'risk_management_for_protection_programs_and_activities',
    name: 'Risk Management for Protection Programs and Activities',
    areas: ['protection'],
    definition:
      'Identify, assess, and prioritize risks to inform Protection activities, countermeasures, and investments.',
  },
  {
    id: 'supply_chain_integrity_and_security',
    name: 'Supply Chain Integrity and Security',
    areas: ['protection'],
    definition: 'Strengthen the security and resilience of the supply chain.',
  },
  {
    id: 'community_resilience',
    name: 'Community Resilience',
    areas: ['mitigation'],
    definition:
      'Enable the recognition, understanding, communication of, and planning for risk and empower individuals and communities to make informed risk management decisions necessary to adapt to, withstand, and quickly recover from future incidents.',
  },
  {
    id: 'long_term_vulnerability_reduction',
    name: 'Long-term Vulnerability Reduction',
    areas: ['mitigation'],
    definition:
      'Build and sustain resilient systems, communities, and critical infrastructure and key resources lifelines so as to reduce their vulnerability to natural, technological, and human-caused threats and hazards by lessening the likelihood, severity, and duration of the adverse consequences.',
  },
  {
    id: 'risk_and_disaster_resilience_assessment',
    name: 'Risk and Disaster Resilience Assessment',
    areas: ['mitigation'],
    definition:
      "Assess risk and disaster resilience so that decision makers, responders, and community members can take informed action to reduce their entity's risk and increase their resilience.",
  },
  {
    id: 'threats_and_hazards_identification',
    name: 'Threats and Hazards Identification',
    areas: ['mitigation'],
    definition:
      'Identify the threats and hazards that occur in the geographic area; determine the frequency and magnitude; and incorporate this into analysis and planning processes so as to clearly understand the needs of a community or entity.',
  },
  {
    id: 'critical_transportation',
    name: 'Critical Transportation',
    areas: ['response'],
    definition:
      'Provide transportation (including infrastructure access and accessible transportation services) for response priority objectives, including the evacuation of people and animals, and the delivery of vital response personnel, equipment, and services into the affected areas.',
  },
  {
    id: 'environmental_response_health_and_safety',
    name: 'Environmental Response/Health and Safety',
    areas: ['response'],
    definition:
      'Conduct appropriate measures to ensure the protection of the health and safety of the public and workers, as well as the environment, from all-hazards in support of responder operations and the affected communities.',
  },
  {
    id: 'fatality_management_services',
    name: 'Fatality Management Services',
    areas: ['response'],
    definition:
      'Provide fatality management services, including decedent remains recovery and victim identification, mortuary processes, temporary storage or permanent interment solutions, information sharing with mass care services to reunify family members and caregivers with missing persons or remains, and counseling to the bereaved.',
  },
  {
    id: 'fire_management_and_suppression',
    name: 'Fire Management and Suppression',
    areas: ['response'],
    definition:
      'Provide structural, wildland, and specialized firefighting capabilities to manage and suppress fires of all types, kinds, and complexities while protecting the lives, property, and the environment in the affected area.',
  },
  {
    id: 'infrastructure_systems',
    name: 'Infrastructure Systems',
    areas: ['response', 'recovery'],
    definition:
      'Stabilize critical infrastructure functions, minimize health and safety threats, and efficiently restore and revitalize systems and services to support a viable, resilient community.',
  },
  {
    id: 'logistics_and_supply_chain_management',
    name: 'Logistics and Supply Chain Management',
    areas: ['response'],
    definition:
      'Deliver essential commodities, equipment, and services in support of impacted communities and survivors, to include emergency power and fuel support, as well as the coordination of access to community staples, and synchronize logistics capabilities to enable the restoration of impacted supply chains.',
  },
  {
    id: 'mass_care_services',
    name: 'Mass Care Services',
    areas: ['response'],
    definition:
      'Provide life-sustaining and human services to the affected population, to include hydration, feeding, sheltering, temporary housing, evacuee support, reunification, and distribution of emergency supplies.',
  },
  {
    id: 'mass_search_and_rescue_operations',
    name: 'Mass Search and Rescue Operations',
    areas: ['response'],
    definition:
      'Deliver traditional and atypical search and rescue capabilities, including personnel, services, animals, and assets to survivors in need, with the goal of saving the greatest number of endangered lives in the shortest time possible.',
  },
  {
    id: 'on_scene_security_protection_and_law_enforcement',
    name: 'On-scene Security, Protection, and Law Enforcement',
    areas: ['response'],
    definition:
      'Ensure a safe and secure environment through law enforcement and related security and protection operations for people and communities located within affected areas and also for response personnel engaged in lifesaving and life-sustaining operations.',
  },
  {
    id: 'operational_communications',
    name: 'Operational Communications',
    areas: ['response'],
    definition:
      'Ensure the capacity for timely communications in support of security, situational awareness, and operations, by any and all means available, among and between affected communities in the impact area and all response forces.',
  },
  {
    id: 'public_health_healthcare_and_emergency_medical_services',
    name: 'Public Health, Healthcare, and Emergency Medical Services',
    areas: ['response'],
    definition:
      'Provide lifesaving medical treatment via Emergency Medical Services and related operations and avoid additional disease and injury by providing targeted public health, medical, and behavioral health support, and products to all affected populations.',
  },
  {
    id: 'situational_assessment',
    name: 'Situational Assessment',
    areas: ['response'],
    definition:
      'Provide all decision makers with decision-relevant information regarding the nature and extent of the hazard, any cascading effects, and the status of the response.',
  },
  {
    id: 'economic_recovery',
    name: 'Economic Recovery',
    areas: ['recovery'],
    definition:
      'Return economic and business activities (including food and agriculture) to a healthy state and develop new business and employment opportunities that result in an economically viable community.',
  },
  {
    id: 'health_and_social_services',
    name: 'Health and Social Services',
    areas: ['recovery'],
    definition:
      'Restore and improve health and social services capabilities and networks to promote the resilience, independence, health (including behavioral health), and well-being of the whole community.',
  },
  {
    id: 'housing',
    name: 'Housing',
    areas: ['recovery'],
    definition:
      'Implement housing solutions that effectively support the needs of the whole community and contribute to its sustainability and resilience.',
  },
  {
    id: 'natural_and_cultural_resources',
    name: 'Natural and Cultural Resources',
    areas: ['recovery'],
    definition:
      'Protect natural and cultural resources and historic properties through appropriate planning, mitigation, response, and recovery actions to preserve, conserve, rehabilitate, and restore them consistent with post-disaster community priorities and best practices and in compliance with applicable environmental and historic preservation laws and Executive orders.',
  },
] as const satisfies readonly CoreCapability[]

export type CoreCapabilityEntry = (typeof CORE_CAPABILITIES)[number]
export type CoreCapabilityId = CoreCapabilityEntry['id']

export const CORE_CAPABILITY_IDS = CORE_CAPABILITIES.map((c) => c.id) as [
  CoreCapabilityId,
  ...CoreCapabilityId[],
]
export const CoreCapabilityId = z.enum(CORE_CAPABILITY_IDS)

const BY_ID = new Map<string, CoreCapabilityEntry>(CORE_CAPABILITIES.map((c) => [c.id, c]))

export const isCoreCapability = (id: string): id is CoreCapabilityId => BY_ID.has(id)

export function coreCapability(id: string): CoreCapabilityEntry | undefined {
  return BY_ID.get(id)
}

/** The capability's name; the id itself for one that is not in the list. */
export const capabilityName = (id: string): string => BY_ID.get(id)?.name ?? id

/**
 * The capabilities most discussion-based exercises touch: the three common capabilities plus
 * the two every cyber-physical scenario exercises. A domain profile without its own
 * `coreCapabilities` hint shows these first.
 */
export const DEFAULT_CAPABILITY_HINTS: readonly CoreCapabilityId[] = [
  'planning',
  'public_information_and_warning',
  'operational_coordination',
  'cybersecurity',
  'infrastructure_systems',
]

/** All 32 capabilities with the hinted ones first (unknown hints ignored), the rest in Goal order. */
export function orderedCapabilities(hints?: readonly string[]): CoreCapabilityEntry[] {
  const first = (hints?.length ? hints : DEFAULT_CAPABILITY_HINTS)
    .map((id) => BY_ID.get(id))
    .filter((c): c is CoreCapabilityEntry => !!c)
  const seen = new Set(first.map((c) => c.id))
  return [...first, ...CORE_CAPABILITIES.filter((c) => !seen.has(c.id))]
}

/** Capabilities grouped by their first mission area, in mission-area order (for pickers). */
export function capabilitiesByArea(): { area: MissionArea; capabilities: CoreCapabilityEntry[] }[] {
  return MISSION_AREAS.map((area) => ({
    area,
    capabilities: CORE_CAPABILITIES.filter((c) => c.areas[0] === area),
  })).filter((g) => g.capabilities.length)
}
