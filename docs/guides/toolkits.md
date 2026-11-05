# Toolkits

A **toolkit** gives an exercise the expertise of one field: its terms, the formats of its products, the outside parties it brings in, the inject types it adds, the decisions players make, and the realism rules a specialist would check. A toolkit is separate from the **domain** that describes the organization you are exercising. An airport exercise and a farming exercise can both use a weather toolkit, and a new field you add later becomes available to every kind of organization.

For a worked example, see [Weather exercises](weather.md). Toolkits come in [packs](packs.md). Install a pack that carries toolkits (or use one included with the app), and its toolkits appear in every scenario.

## Turn toolkits on for a scenario

1. Open the scenario and choose the **Toolkits** tab.
2. Tick the toolkits this scenario needs. Each one shows the pack it comes from and a short description. Open **What it adds** to see the inject types, outside parties, advisor roles, charts, data sources, decisions, evaluation measures and reference documents it brings, and how much writing guidance it carries.
3. Untick a toolkit to turn it off. Your choice is saved at once, and a screen reader announces it.

A new scenario starts with the toolkits switched on for the project, then keeps its own list. Changing one scenario never changes another.

## Suggestions

The tab proposes toolkits in two cases:

- the brief mentions a hazard or threat the toolkit covers (for example, a gale for a harbor toolkit). The suggestion quotes the word it found;
- the kind of organization you chose lists the toolkit as a natural fit.

A suggestion only proposes. Press **Add** to turn the toolkit on, or **Not now** to hide it for this visit. The app never turns a toolkit on by itself.

## What a toolkit changes in the exercise

For a scenario with toolkits on:

- every writing step receives the toolkits' terms, product formats and realism rules, within a size limit so they never crowd out your own documents. The text is guidance for the writer; your documents still win when they disagree;
- the toolkit's outside parties join the ones your kind of organization already deals with, and its inject types join the types the writer may choose;
- the controller handbook gets a **Toolkits used** section that names each toolkit, its data sources and its reference documents.

A toolkit whose pack you remove or turn off is skipped. The scenario keeps its list, and the toolkit works again when the pack is back.

## Decisions, measures and format checks

Toolkits also connect to the rest of the app once they are on for a scenario.

**Decisions.** The decisions a toolkit defines, such as "Issue a bulletin" or "Order an evacuation", appear for players in live play and for you in Facilitate, next to the decisions you already have. Each one is a small form (choices, a number, a time, a place). Everything entered goes into the session log. If you turn a toolkit off, its decisions are no longer offered.

**Field metrics.** Open the scenario's Evaluation tab. When a toolkit brings measures, such as how long before an event a decision was made, **Compute field metrics** reads the newest live session and the scenario's case data and shows each result with the inputs it used and its caveats. Press **Refresh field metrics** to recompute after a new session. The same results appear in the after-action report under **Field Metrics**. A measure that cannot be computed is listed with the reason (for example, the dataset it compares against is not in the scenario), and the others still run.

For **message consistency**, add the key facts partners should agree on, then add what each partner stated for them, and press **Save key facts**. The measure compares only what you entered.

**Format checks.** A toolkit can bring format checks for its products. They run on the injects as they are written, and again when you check the scenario; findings appear as warnings on the inject.

A scenario without toolkits behaves as it always did.

## When a pack names something this app does not have

A toolkit can only use charts, data sources, measures and format checks built into the app. If a pack names one your version of the app does not have, the pack still installs. Its details list the unknown names under **Names things this app lacks**, and those parts are ignored. Updating the app usually resolves it. The same notice appears for a domain that prefers an inject type nothing installed provides.
Field packs that use toolkits: [Flooding exercises](flooding.md), [AI incidents and synthetic media](ai-incidents.md), [Research laboratories and biosafety](research-labs.md), [Animal disease response](animal-disease.md), [Pharmacy and drug supply](pharmacy.md), [Supply chain and logistics](supply-chain.md), [Space weather exercises](space-weather.md), [Corporate governance](governance.md), [Behavioral health and human services](human-services.md), [Wildfire exercises](wildfire.md).

## Add your own

A toolkit is a small JSON file in a pack. The format, with an example, is in the [pack format reference](../packs-format.md#toolkits-format-3). Anything that needs a program (a chart kind, a public data source, an evaluation measure, a format check) is built into the app; a toolkit names it and sets it up, and cannot add new code. Developers who add a whole new field can follow the [developer guide](../developers/adding-a-field.md).
