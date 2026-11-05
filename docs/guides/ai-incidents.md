# AI incident and synthetic media exercises

The **AI incidents and synthetic media** pack gives an exercise the two new kinds of incident of the AI era: a synthetic media attack (a deepfaked executive on a video call asking for a payment, a fake video of a spokesperson, invented news about the organization) and the failure of an AI system (harmful answers from a customer assistant, poisoned data, a breach at an AI vendor). It has two parts, and you can use either one.

- The **AI incidents and synthetic media** domain describes a security and fraud team, an AI governance and product team, a trust and safety team on a platform, or a board. Choose it when the organization you are exercising is one of those.
- The **AI incidents toolkit** adds the field to any other kind of organization: a bank, a county, a campus, a hospital or a telecom carrier can turn it on. See [Toolkits](toolkits.md). It is suggested for financial services, elections, campus, healthcare, municipal, emergency communications, telecom, data center and IT, and crisis communications exercises, and whenever a brief mentions a deepfake, voice cloning, a chatbot, an AI vendor or harmful AI output. It works with the [media environment](toolkits.md) toolkit, which supplies verification, social spread and press.

## What the exercise knows

- **A deepfake is a lure.** Amounts, account numbers and instructions arrive in text (the payment request, the chat message), never only in audio. The exercise rewards the callback on a number found in the company directory, not the number in the request.
- **A detector can be wrong.** A detector score is always shown with its uncertainty, with the number of authentic items it flagged and synthetic items it passed. A missing content credential proves nothing.
- **Duties differ by role.** The serious incident duty of the EU AI Act binds providers of high-risk AI systems. A deployer gives the provider information. A company defrauded by a deepfake, with no AI system of its own involved, has a fraud and cyber incident. The scenario asks which role it assumes, and the reporting clocks follow it. The app gives no legal advice: check which of your own plans apply.

## Threat families

Synthetic impersonation fraud, synthetic media about the organization, AI system malfunction or misuse, data poisoning and model tampering, AI vendor or supply chain breach, and AI service degradation (a monitoring blind spot, an expired evaluation pipeline, a detector outage). Each has a four-phase arc.

## Products

Templates for the model incident report, the AI system inventory entry, the serious incident notification draft (system, date of awareness, causal link assessment, harm, status, and a field for parallel reports to other authorities), the customer notice, the platform takedown request, the bank payment recall request, the vendor incident notice and the vendor questionnaire. Everything is marked as exercise material. Bank accounts carry a TEST prefix so that no real account number appears.

Charts, drawn from data and never from AI images, each with a text summary and a data table, and each labeled simulated:

- **Harmful-output rate:** the daily rate against the review threshold, with the day the change began and the first day the rate stayed over the threshold.
- **Moderation queue:** items received and reviewed each hour and the backlog.
- **Detector scores:** the distribution for authentic and synthetic items, the threshold, the error counts and the score of the item under review in words with its uncertainty.
- **Payment timeline:** each transfer from request to settlement, the discovery, and how much a hold could still stop.
- **AI system inventory:** systems with purpose, risk class, owner, vendor and status.

## Synthetic media in an exercise

You may have a voice or video provider produce a deepfake-style voicemail, audio clip or video still. The app keeps this safe:

- **Fictional only.** Mark the inject **Synthetic media** in the inject editor. The app then refuses a media brief that names a real person (it keeps a list of well-known names) or asks for a likeness ("sounds like", "voice of", "clone"). Describe a fictional person from scratch: age, build, voice quality.
- **Marked everywhere.** Each such item shows a visible exercise mark in the editor. Exported files start with `EXERCISE-SYNTHETIC-` and a header page beside them lists the files and the rules.
- **Stays in the project.** Export as pack refuses a project that holds synthetic media.
- **Text first.** Every audio or video inject needs a transcript and a description. Where no provider is set up, a transcript or a described still stands in.

## Decisions and measures

Players record structured decisions: hold or release a payment, verify by callback, declare an incident, classify a serious incident (with the role assumed and the basis), pause or roll back a feature, preserve evidence, notify a regulator, customers, the bank and law enforcement or the vendor, issue a statement, request a takedown.

The evaluation measures compare those decisions with the simulated event: time from the first exposure to the first flag and to the declaration; payments held against payments attempted (a recall request is shown apart from a hold, because a request is not a recovery); each reporting clock met or missed; and time from detection to the kill switch or rollback, with whether evidence was preserved first. Verification before response comes from the media environment. They are discussion aids, not benchmarks.

## Reporting clocks

Turn on the **EU AI Act Article 73 serious incident reporting** rule in Settings, then Compliance, when the scenario's organization is a provider of a high-risk AI system: 15 days from awareness of a serious incident, 2 days for a widespread infringement or an incident involving critical infrastructure, and 10 days for a death, each starting from its own trigger; an incomplete first report is allowed. The rule lists the dates when the Act starts to apply, which changed in 2026; check them against the Official Journal text. Settings warns when a rule was last checked more than twelve months ago. For a public company, the SEC Form 8-K rule counts four business days from a decision that an incident is material.

## Reference library

The **AI incidents reference library** pack (installed from the catalog) carries the NIST AI Risk Management Framework and its Generative AI Profile, the FinCEN alert on deepfake fraud and the FCC ruling on AI voices in robocalls. All are US government works. The EU AI Act text, the AI Incident Database, the FBI Internet Crime Complaint Center announcement on impersonation of senior officials and the Content Credentials specification are linked in the pack's README, not bundled.

## Limits

- Detector scores, payments, evaluation series and queues are simulations. They are not a real detector, a real bank or a real system.
- No real person's face or voice is used or imitated, and no real organization is impersonated.
- The app does not file anything with a regulator and does not give legal advice.
