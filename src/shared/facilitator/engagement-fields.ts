/**
 * Where each social template keeps its counts and comments (spec 0428 §3). A pack template
 * declares its own in meta.json `engagement`; these are the built-in ones.
 */
import type { EngagementReply } from '../schemas/inject'

export interface ReplyField {
  /** Top-level field holding the list. */
  field: string
  /** The template's own `maxItems`. */
  max: number
  /** One reply in the shape the template's list items have. */
  make: (reply: EngagementReply) => Record<string, unknown>
}

export interface EngagementFieldMap {
  /** Metric name -> field path ("metrics.likes" is a nested path). */
  metrics: Record<string, string>
  replies?: ReplyField
}

export const ENGAGEMENT_FIELDS: Record<string, EngagementFieldMap> = {
  tweet: {
    metrics: {
      likes: 'metrics.likes',
      reposts: 'metrics.reposts',
      replies: 'metrics.replies',
      views: 'metrics.views',
    },
  },
  facebook_post: {
    metrics: { reactions: 'reactions', comments: 'commentCount', shares: 'shares' },
    replies: {
      field: 'comments',
      max: 4,
      make: (r) => ({ author: r.author, text: r.text }),
    },
  },
  instagram_post: {
    metrics: { likes: 'likes', comments: 'commentCount' },
    replies: {
      field: 'comments',
      max: 2,
      make: (r) => ({ handle: r.handle || r.author, text: r.text }),
    },
  },
  reddit_post: {
    metrics: { upvotes: 'upvotes', comments: 'commentCount' },
    replies: {
      field: 'comments',
      max: 3,
      make: (r) => ({ author: r.handle || r.author, text: r.text }),
    },
  },
  tiktok_video_card: {
    metrics: { views: 'viewCount', likes: 'likes', comments: 'commentCount', shares: 'shares' },
  },
  leak_site_post: { metrics: { views: 'views' } },
}

/** Whether an inject type can carry an engagement plan. */
export const hasEngagement = (type: string): boolean => type in ENGAGEMENT_FIELDS

/** The metric names a type offers, in display order. */
export const metricNames = (type: string): string[] =>
  Object.keys(ENGAGEMENT_FIELDS[type]?.metrics ?? {})
