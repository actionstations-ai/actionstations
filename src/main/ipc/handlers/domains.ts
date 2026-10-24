// Domain profiles (#263): built-in plus enabled-pack profiles for the renderer's picker.
import { defineHandlers } from '../registry'
import { listDomainProfiles } from '../../domains/registry'

export default defineHandlers({
  'domains:list': () => listDomainProfiles(),
})
