// Prints survey forms or the results summary through the export path (export:run with
// surveys_pdf / survey_results_pdf) into the folder last used for this project's exports.
import { useCallback, useState } from 'react'
import type { JobDoneEvent } from '@shared/schemas/job'
import { errorText } from '../../lib/errors'
import { asExportResult, rememberedOutDir, type ExportJobResult } from '../export/targets'
import { useExportJob } from '../export/use-export-job'

export function useSurveyPrint(projectPath: string, scenarioId: string) {
  const [result, setResult] = useState<ExportJobResult | null>(null)
  const [error, setError] = useState('')
  const onDone = useCallback((e: JobDoneEvent) => setResult(asExportResult(e.result)), [])
  const job = useExportJob(projectPath, scenarioId, onDone)
  const print = async (surveyIds: string[], targets: ('surveys_pdf' | 'survey_results_pdf')[]) => {
    setResult(null)
    setError('')
    try {
      await job.run(rememberedOutDir(projectPath), targets, {}, surveyIds)
    } catch (err) {
      setError(errorText(err))
    }
  }
  return { ...job, result, error, print }
}
