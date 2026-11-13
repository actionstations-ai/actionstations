# TPC-SEC-02: AI and Synthetic Media Incident Response Plan

Tamarack Precision Components, Inc. · Information Security, Legal and Communications · Revision 3

## 1. Purpose

This plan covers two kinds of event: (a) an attack that uses synthetic media (a cloned voice, a deepfaked video participant, a forged image or document) against Tamarack's people, payments or reputation; and (b) a failure of an AI system that Tamarack uses or has deployed. It supplements the Incident Response Plan (TPC-SEC-01).

## 2. Definition of an AI incident

An event in which an AI system or AI-generated content causes, or nearly causes, harm to Tamarack, its customers, its people or its suppliers. The security duty officer declares an AI or synthetic media incident when there is a credible report that a person has been impersonated by generated media, or when a Tamarack AI system produced a harmful or unexpected result. A suspected deepfake that has already led to a payment is declared at once as a fraud and AI incident.

## 3. Roles

| Role | Person | Duty |
|---|---|---|
| Incident Commander (security) | Chief Information Security Officer, Rafael Oyelaran-Pierce | Declares, leads technical response, decides on takedown requests |
| Fraud and Treasury lead | Treasury Manager, Gareth Lindqvist-Boyd | Holds and recalls payments; keeps the payment reconciliation |
| Finance executive | Chief Financial Officer, Marcus Delacroix-Hume; Controller, Anjali Whitcombe | Approves loss figures and bank steps |
| Legal | General Counsel, Priscilla Aranguren | Preservation, regulators, law enforcement, insurer, privilege |
| Communications | Director of Corporate Communications, Dorothea Skarsgaard-Blum | Holding statements, employee and customer messages, media |
| AI governance | AI Governance Lead, Tobias Whitlock | Inventory of AI systems; provider and deployer duties; pausing a model |
| HR | VP People, Lena Fairweather-Kim | Employee support, interviews |

## 4. First hour

1. **Hold:** put every pending payment connected to the request on HOLD.
2. **Verify:** reach the impersonated person on a known number, not through the channel in question.
3. **Preserve:** save the meeting recording, the invitation, the calendar entry and links, the chat log, the email headers, the audio or video files, the Workstation audit log and the bank confirmations. Do not forward the media widely; store it in the incident vault. Mark it "flagged synthetic media" so it is not reused in training material.
4. **Declare:** the CISO declares and opens the war room (bridge 864-555-0100, code 4417).
5. **Assess:** detector tools and provenance checks (below) are used as one input, not as proof.
6. **Notify:** the bank, then the General Counsel, Communications, the insurer, within the times in section 7.

## 5. Detection and provenance

Tamarack uses SynthCheck (a vendor deepfake detector) and Content Credentials (C2PA) validation. A detector returns a score between 0 and 1 with a stated uncertainty and both false positive and false negative rates, which on Tamarack's validation set are 6 percent and 11 percent; a score is never evidence that a clip is real or fake alone. A missing Content Credential proves nothing, because most meeting platforms do not sign. A valid credential from a trusted signer shows the file has not been changed since signing. Human checks include asking the participant to turn sideways, to hold a hand across the face, to answer a question only the person knows, and checking the meeting platform's logs for the participant's authenticated identity and the originating address.

## 6. AI system incidents

For a Tamarack AI system (the supplier-quality vision model, the procurement assistant and the HR policy chatbot), the AI Governance Lead may pause or disable a feature on the CISO's agreement. Evidence of the model version, prompt, logs and inputs is preserved. Where an AI system could cause serious harm (to health, safety or fundamental rights), the Governance Lead and General Counsel assess within 24 hours whether Tamarack is a provider or deployer of a system under a regulator's serious-incident rules, such as Article 73 of the EU AI Act for the Poznań plant's products and any customers there; for a deployer the question is whether to notify the provider and the authority, and clocks begin when Tamarack becomes aware of the incident. A defrauded company with no AI system of its own involved has a fraud and cyber incident, not a regulatory AI incident, although the same plan is used.

## 7. Notifications and clocks

| Who | When | By |
|---|---|---|
| Bank fraud desk | Immediately when a payment was released | Treasury Manager |
| General Counsel | Within 30 minutes of declaration | CISO |
| Cyber and crime insurer | Within 24 hours | General Counsel |
| FBI IC3 | Within 72 hours for wires (sooner the better); the local FBI field office by phone if more than $1 million | General Counsel |
| State law enforcement (SLED) | At General Counsel's discretion | General Counsel |
| Affected customers or suppliers | When their data or payment was involved, as counsel decides | General Counsel, Communications |
| Platform trust and safety (to remove a fake clip) | After preservation, same day | Communications, CISO |
| Board audit committee chair | Within 24 hours if the loss exceeds $1 million | CFO |

## 8. Recovery and lessons

After containment the CISO produces a timeline within 5 working days. The Controller reconciles the payments. Policies on callback, executive impersonation, video meeting identity and awareness training are updated within 30 days, and the incident is added to the board's quarterly risk report.
