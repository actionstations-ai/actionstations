// media:confirm-answer: the user's answer to the paid-media confirmation.
import { answerMediaConfirm } from '../../generate/injects/media-confirm'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'media:confirm-answer': ({ requestId, decision, dontAskAgain }) => {
    answerMediaConfirm(requestId, { decision, dontAskAgain })
  },
})
