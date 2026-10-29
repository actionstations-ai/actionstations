// SAME event codes (47 CFR 11.31(e)) and EAS originator codes (11.31(d)). Used by the
// cap_alert and eas_broadcast templates' schemas and by the code-built SAME header and crawl
// wording; templates/injects/*/schema.json enums are checked against this list by a test.

export const SAME_EVENTS = {
  ADR: 'Administrative Message',
  AVA: 'Avalanche Watch',
  AVW: 'Avalanche Warning',
  BZW: 'Blizzard Warning',
  CAE: 'Child Abduction Emergency',
  CDW: 'Civil Danger Warning',
  CEM: 'Civil Emergency Message',
  CFA: 'Coastal Flood Watch',
  CFW: 'Coastal Flood Warning',
  DMO: 'Practice/Demo Warning',
  DSW: 'Dust Storm Warning',
  EAN: 'Emergency Action Notification',
  EQW: 'Earthquake Warning',
  EVI: 'Evacuation Immediate',
  EWW: 'Extreme Wind Warning',
  FFA: 'Flash Flood Watch',
  FFS: 'Flash Flood Statement',
  FFW: 'Flash Flood Warning',
  FLA: 'Flood Watch',
  FLS: 'Flood Statement',
  FLW: 'Flood Warning',
  FRW: 'Fire Warning',
  HLS: 'Hurricane Statement',
  HMW: 'Hazardous Materials Warning',
  HUA: 'Hurricane Watch',
  HUW: 'Hurricane Warning',
  HWA: 'High Wind Watch',
  HWW: 'High Wind Warning',
  LAE: 'Local Area Emergency',
  LEW: 'Law Enforcement Warning',
  NMN: 'Network Message Notification',
  NPT: 'National Periodic Test',
  NUW: 'Nuclear Power Plant Warning',
  RHW: 'Radiological Hazard Warning',
  RMT: 'Required Monthly Test',
  RWT: 'Required Weekly Test',
  SMW: 'Special Marine Warning',
  SPS: 'Special Weather Statement',
  SPW: 'Shelter In Place Warning',
  SQW: 'Snow Squall Warning',
  SSA: 'Storm Surge Watch',
  SSW: 'Storm Surge Warning',
  SVA: 'Severe Thunderstorm Watch',
  SVR: 'Severe Thunderstorm Warning',
  SVS: 'Severe Weather Statement',
  TOA: 'Tornado Watch',
  TOE: '911 Telephone Outage Emergency',
  TOR: 'Tornado Warning',
  TRA: 'Tropical Storm Watch',
  TRW: 'Tropical Storm Warning',
  TSA: 'Tsunami Watch',
  TSW: 'Tsunami Warning',
  VOW: 'Volcano Warning',
  WSA: 'Winter Storm Watch',
  WSW: 'Winter Storm Warning',
} as const satisfies Record<string, string>
export type SameEventCode = keyof typeof SAME_EVENTS
export const SAME_EVENT_CODES = Object.keys(SAME_EVENTS) as SameEventCode[]

/** EAS originators: who the header says sent the message. */
export const EAS_ORIGINATORS = {
  CIV: { label: 'Civil authorities', crawl: 'A CIVIL AUTHORITY HAS ISSUED' },
  WXR: { label: 'National Weather Service', crawl: 'THE NATIONAL WEATHER SERVICE HAS ISSUED' },
  EAS: { label: 'EAS Participant', crawl: 'AN EAS PARTICIPANT HAS ISSUED' },
  PEP: { label: 'Primary Entry Point System', crawl: 'THE PRIMARY ENTRY POINT SYSTEM HAS ISSUED' },
} as const
export type EasOriginator = keyof typeof EAS_ORIGINATORS
export const EAS_ORIGINATOR_CODES = Object.keys(EAS_ORIGINATORS) as EasOriginator[]

/** "Tornado Warning" for TOR; the code itself for one the list does not know. */
export const sameEventName = (code: string): string =>
  (SAME_EVENTS as Record<string, string>)[code] ?? code
