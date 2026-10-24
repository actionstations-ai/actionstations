// First-run setup wizard (#48): welcome, text model, media, search quality, first project.
// Every step can be skipped; progress is remembered so a restart resumes where it was left.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { clsx } from 'clsx'
import { Button, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient } from '../../lib/query'
import { DoneStep } from './steps/DoneStep'
import { MediaStep } from './steps/MediaStep'
import { ProjectStep } from './steps/ProjectStep'
import { RuntimeStep } from './steps/RuntimeStep'
import { SearchStep } from './steps/SearchStep'
import { TextModelStep } from './steps/TextModelStep'
import { WelcomeStep } from './steps/WelcomeStep'
import {
  STEPS,
  clearProgress,
  loadProgress,
  nextStep,
  previousStep,
  saveProgress,
  type StepId,
  type WizardProgress,
} from './wizard-state'
import './welcome.css'

async function markComplete(): Promise<void> {
  await call('settings:update', { onboardingComplete: true })
  await queryClient.invalidateQueries({ queryKey: ['settings:get'] })
}

function Stepper(props: { current: StepId; onJump: (s: StepId) => void }) {
  const currentIndex =
    props.current === 'done' ? STEPS.length : STEPS.findIndex((s) => s.id === props.current)
  return (
    <nav aria-label="Setup steps">
      <ol className="wizard-stepper">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={clsx(
              'wizard-stepper__item',
              i < currentIndex && 'is-done',
              i === currentIndex && 'is-current',
            )}
          >
            <button
              type="button"
              className="wizard-stepper__btn"
              aria-current={i === currentIndex ? 'step' : undefined}
              onClick={() => props.onJump(s.id)}
            >
              <span className="wizard-stepper__num" aria-hidden>
                {i + 1}
              </span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function useWizardProgress() {
  const [progress, setProgress] = useState<WizardProgress>(loadProgress)
  useEffect(() => {
    if (progress.step === 'done') clearProgress()
    else saveProgress(progress)
  }, [progress])
  const goTo = (step: StepId) => setProgress((p) => ({ ...p, step }))
  const setProject = (projectPath: string) =>
    setProgress((p) => ({ ...p, projectPath, step: nextStep('project') }))
  return { progress, goTo, setProject }
}

export default function WelcomePage() {
  const navigate = useNavigate()
  const { progress, goTo, setProject } = useWizardProgress()
  const step = progress.step
  useEffect(() => {
    if (step === 'done')
      void markComplete().catch((err: unknown) => toast.error('Could not save setup state', err))
  }, [step])
  const skipSetup = async () => {
    try {
      await markComplete()
      clearProgress()
      void navigate('/projects')
    } catch (err) {
      toast.error('Could not skip setup', err)
    }
  }
  const nav = { onBack: () => goTo(previousStep(step)), onNext: () => goTo(nextStep(step)) }
  return (
    <div className="page wizard">
      <PageHeader
        eyebrow="Setup"
        title="Set up Action Stations"
        actions={
          step !== 'done' && (
            <Button variant="ghost" onClick={() => void skipSetup()}>
              Skip setup
            </Button>
          )
        }
      />
      <Stepper current={step} onJump={goTo} />
      {step === 'welcome' && <WelcomeStep onNext={nav.onNext} />}
      {step === 'runtime' && <RuntimeStep {...nav} />}
      {step === 'text' && <TextModelStep {...nav} />}
      {step === 'media' && <MediaStep {...nav} />}
      {step === 'search' && <SearchStep {...nav} />}
      {step === 'project' && (
        <ProjectStep
          createdPath={progress.projectPath}
          onBack={nav.onBack}
          onCreated={setProject}
          onSkip={nav.onNext}
        />
      )}
      {step === 'done' && <DoneStep projectPath={progress.projectPath} />}
    </div>
  )
}
