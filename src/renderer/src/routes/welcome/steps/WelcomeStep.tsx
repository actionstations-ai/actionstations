import { StepLayout, type StepNav } from '../StepLayout'

const OUTPUTS = [
  'Scenario narrative and exercise objectives',
  'Master Scenario Events List (MSEL) with timed injects',
  'Inject deck with documents, social posts, images and audio',
  'Controller handbook and player briefing',
]

export function WelcomeStep({ onNext }: StepNav) {
  return (
    <StepLayout
      title="Welcome to Action Stations"
      intro={
        <p>
          Turn your organization&rsquo;s plans and procedures into a complete, editable tabletop
          exercise. Setup takes a few minutes; every step can be skipped and changed later.
        </p>
      }
      onNext={onNext}
      nextLabel="Get started"
    >
      <div className="wizard-columns">
        <div className="card stack">
          <h3>What you get</h3>
          <ul className="wizard-list">
            {OUTPUTS.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
        <div className="card stack">
          <h3>Your documents stay on this computer</h3>
          <p>
            Projects are folders on your disk. There is no account and no telemetry. Nothing leaves
            this machine except requests to the model providers you add yourself.
          </p>
          <p className="muted">
            With local providers such as LM Studio, Ollama and ComfyUI, nothing leaves at all.
          </p>
        </div>
      </div>
    </StepLayout>
  )
}
