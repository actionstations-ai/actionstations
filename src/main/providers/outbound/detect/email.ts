// Email addresses: the practical subset of RFC 5322 (dot-atom local part, dotted domain with a
// letter TLD). Quoted local parts and IP-literal domains are not matched.
import { span, type DetectedSpan } from './types'

const EMAIL =
  /(?<![\w.%+-])[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}(?![\w-])/g

export function detectEmails(text: string): DetectedSpan[] {
  return [...text.matchAll(EMAIL)].map((m) => span(text, m.index, m.index + m[0].length, 'email'))
}
