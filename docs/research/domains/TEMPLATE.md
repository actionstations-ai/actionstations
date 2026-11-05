# Domain dossier: `<id>` (<the field in a few words>)

Research for the <field> epic (#NNN, spec NNNN), built on the toolkit framework (#648, spec 0448). Researched YYYY-MM-DD. **[V]** = checked this session against a primary or official source. **[U]** = not verified this session.

How to use this template: copy it to `docs/research/domains/<id>.md`, fill every section, and delete the italic guidance. Write only what you checked and mark the rest **[U]**. Then follow [Adding a professional field](../../developers/adding-a-field.md).

## 1. Scope

_Who the field covers and who it does not._

**Covers:** the people who do the work, and everyone who must act on their products.

- **Practitioners and outside parties:** the agencies, offices and programs that produce the field's data and products.
- **Managers and responders:** the organizations that use them.

**Exercise types this field needs:** one bullet per kind of exercise (the incident, its tempo, what triggers action).

**Aliases:** words people use for the field. They become `aliases` and keywords.

**Domain, toolkit or both, and why:** which organization is exercised, and what other domains would borrow.

## 2. Roles

| Title | Abbrev. | Team | What they decide |
| ----- | ------- | ---- | ---------------- |
|       |         |      |                  |

**Outside parties:** agencies, vendors, media, volunteers, neighboring jurisdictions.

## 3. Systems

_Information and operational systems the roles use, with the identifiers documents state._

- **Data and forecasts:**
- **Alerting and communication:**
- **Operational (IT and OT):**
- **Dependencies that can fail:**

## 4. Products

_What injects look like. One row per product, and how it renders._

| Product | From | Render                                                                        |
| ------- | ---- | ----------------------------------------------------------------------------- |
|         |      | text template, data figure, map, existing template, or AI image (scenes only) |

_Text a player must read is a template, never AI pixels. Note the exact format conventions (units, codes, tags, issuance times) a specialist would catch if wrong._

## 5. Doctrine

_Regulations, standards, plans and guidance the field works from, with edition and date._

- **Definitions and terminology:**
- **Product specifications:**
- **Required plans and exercises:**
- **Exercise material and published after-action reports:**

**Public-domain documents to bundle:** title, publisher, edition, URL, size, sha256 if known, and the licence basis (US federal work under 17 U.S.C. section 105, or CC0). Verify the licence on the publisher's page. Copyrighted references are named here and never bundled.

## 6. Data sources

_Free, public archives for replay and figures._

| Data | Source and endpoint | Terms of use | Key needed | Rate limits | What it cannot give |
| ---- | ------------------- | ------------ | ---------- | ----------- | ------------------- |
|      |                     |              |            |             |                     |

_Say what each source cannot give, for example an endpoint that returns only the current forecast and not an archive. Note whether the data may be modified and how a modification must be labeled. Connectors call only fixed hosts, only after the user agrees._

**What must be simulated:** the data no archive provides, the parameters of a simple generator, and how each output is labeled as simulated. No real people or patients.

## 7. Figures

| Figure | Data it draws | Question it answers for the reader | Text summary and table |
| ------ | ------------- | ---------------------------------- | ---------------------- |
|        |               |                                    |                        |

_Every figure needs a summary and a data table. Note color or pattern needs, and any category tables that differ by place._

## 8. Evaluation

- **Decisions scored, and against what** (a threshold series, a ground-truth event, a target the designer sets):
- **Existing metrics that fit** (`decision_timing`, `threshold_timing`, and others):
- **New metrics needed:**
- **Decision forms players fill in** (id, fields, the option ids a metric reads):
- **Core Capabilities touched** (FEMA) and any program exercise definitions:
- **Format rules a lint can check:**
- **Known scoring caveats:**

## 9. Threat families

_Hazard-driven and operations-driven incident kinds. For each: id, one line, keywords, and a four-phase arc (a goal and beats per phase). Ids must not repeat a built-in family or another pack's._

## 10. Reuse by other domains

_Which existing domains would turn this toolkit on and what they would use it for. List their ids: they go in this toolkit's `appliesTo.domains` and in each domain's `suggestedToolkits`. Every bundled domain also takes `media_environment`._

## 11. Example project

_One realistic example exercise: the organization (a real city is fine; the exercising organization, people and private businesses are fictional), the brief in two sentences, the arc, the injects it needs, the data it replays or simulates, and the decisions it scores._

## Sources

_Each source with its URL, the date read, and what it supports._
