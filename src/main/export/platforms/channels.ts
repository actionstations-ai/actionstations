// One table from inject type to a neutral channel, and from a neutral channel to the name each
// exercise platform uses for it (spec 0432). Types without an entry take their taxonomy
// category's default; a type the app does not know (a pack type with no mapping) is `document`.
import { injectTypeInfo } from '@shared/taxonomy'

export const CHANNELS = [
  'email',
  'social_micro',
  'social_post',
  'messaging',
  'news_web',
  'blog',
  'video',
  'tv',
  'radio',
  'phone',
  'notification',
  'log',
  'ticket',
  'document',
] as const
export type Channel = (typeof CHANNELS)[number]

const BY_TYPE: Record<string, Channel> = {
  tweet: 'social_micro',
  reddit_post: 'blog',
  tiktok_video_card: 'video',
  social_video: 'video',
  news_chyron_still: 'tv',
  eas_broadcast: 'tv',
  news_article: 'news_web',
  press_release: 'news_web',
  text_message: 'messaging',
  chat_transcript: 'messaging',
  voicemail: 'phone',
  radio_call: 'radio',
  pa_announcement: 'radio',
  phone_call: 'phone',
  helpdesk_ticket: 'ticket',
  '911_cad_entry': 'log',
  incident_alert_notification: 'notification',
  cap_alert: 'notification',
  nws_weather_warning: 'notification',
  rider_service_alert: 'notification',
  service_status_page: 'news_web',
}

const BY_CATEGORY: Record<string, Channel> = {
  social: 'social_post',
  news: 'news_web',
  internal: 'email',
  voice: 'phone',
  technical: 'log',
  operational: 'notification',
  documents: 'document',
  control: 'document',
}

export function channelFor(type: string): Channel {
  const known = BY_TYPE[type]
  if (known) return known
  const category = injectTypeInfo(type)?.category
  return (category && BY_CATEGORY[category]) || 'document'
}

/** Conducttr's `Method` column value for a channel. */
const CONDUCTTR_METHOD: Record<Channel, string> = {
  email: 'Email',
  social_micro: 'MicroBlog',
  social_post: 'GoSocial',
  messaging: 'Msngr',
  news_web: 'Websites / News',
  blog: 'Websites / News',
  video: 'Websites / News',
  tv: 'TV',
  radio: 'Walkie-talkie',
  phone: 'Phone Call',
  notification: 'Notification',
  log: 'Log',
  ticket: 'Help Desk',
  document: 'Email',
}
export const conducttrMethod = (type: string): string => CONDUCTTR_METHOD[channelFor(type)]

/** SimulationDeck's channel names; channels it has none for are posted as documents. */
const SIMDECK_CHANNEL: Record<Channel, string> = {
  email: 'Document',
  social_micro: 'Social media',
  social_post: 'Social media',
  messaging: 'Social media',
  news_web: 'Online newspaper',
  blog: 'Blogs',
  video: 'Video',
  tv: 'Broadcast TV news',
  radio: 'Radio',
  phone: 'Document',
  notification: 'Document',
  log: 'Document',
  ticket: 'Document',
  document: 'Document',
}
export const simulationDeckChannel = (type: string): string => SIMDECK_CHANNEL[channelFor(type)]
