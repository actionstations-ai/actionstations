# What goes to cloud models

Action Stations runs entirely on your computer with local models. When you route a task to a **cloud provider**, the app shows you exactly what would be sent before it goes, asks you to approve it, and can replace people's names, phone numbers, email addresses and street addresses with placeholders. Local providers are not affected by anything on this page.

## Which providers count as cloud

A provider is a cloud provider when:

- it is **Anthropic**, or
- its base URL points anywhere other than this computer (`127.0.0.1`, `localhost`, `::1`). An OpenAI-compatible endpoint such as OpenRouter, a remote Ollama server or a ComfyUI machine elsewhere all count.

A server on your own network (for example `192.168.1.20` or `gpu.local`) also counts as cloud until you open the provider (**Providers → Edit**) and tick **On my network, treat as local**. Only do that for a machine you control. The option is offered only for private network addresses (`10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`, IPv6 `fc00::/7` and `fe80::/10`) and `.local`, `.lan`, `.home.arpa` and `.internal` names, never for a public host. It applies to the address it was ticked for: change the base URL and the provider is cloud again until you tick it again.

On Ollama, models whose names end in `-cloud` (for example `gpt-oss:120b-cloud`) run on ollama.com, so requests to them are cloud requests even though they go through the Ollama app on your computer.

Cloud providers carry the marker **Cloud: sends excerpts to _host_** on the Providers page, in the routing table, and on the home page of each project that routes a task to one.

The **Test** button on the Providers page, the voice sample and the Workflows page test renders send fixed sample text, never project content, and do not ask.

## The approval dialog

When a job is about to send a request to a cloud provider and your review setting asks for it, the job pauses. The jobs tray shows **Waiting for your approval**, a notice appears, and **Review** opens the dialog. It shows:

- where the request goes: provider, host and model, and the task and stage;
- the **plan excerpts**, grouped by document with the section heading and page, collapsed so a large request fits on one screen. Expand a document to read the excerpts as they will be sent;
- the **other content** (the instructions, the reference context, your request and any earlier turns of a repair round);
- the **redaction summary**: how many names, phones, emails and addresses were replaced. Each replaced value is marked in the text with a label such as `[name]`, the value itself and the placeholder that is sent instead.

Your choices:

| Action                                            | What happens                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Send**                                          | This request is sent.                                                                                                                        |
| **Send and approve these documents for this job** | This request is sent, and later requests in the same job that use excerpts from the same documents go without asking.                        |
| **Change redaction**                              | Opens the project's **Cloud and privacy** page. When you save, the waiting request is rebuilt with the new settings and you are asked again. |
| **Cancel job**                                    | Nothing is sent and the job is cancelled.                                                                                                    |

Your approval covers the exact request you saw. If anything changes before it is sent (a repair round, different settings), the app treats it as a new request.

## When the app asks

Set in **Settings → Privacy** for all projects, and per project on **Cloud and privacy** (in the project's Advanced section). A project's choices are kept on this computer. Only the part that is stricter than your defaults (asking more often, more categories, more Always-redact terms) is also written into the project file, so it travels with the folder. Settings that arrive in a project file (a copied project, an example) can make review and redaction stricter, never looser; examples and packs never carry them.

- **Ask when new content would be sent** (default): ask whenever a request would send a plan excerpt or any other content (an earlier stage's result, a prompt, facility facts) not yet approved in that job. Requests that repeat approved content, or carry excerpts from documents you approved for the job, go without asking. In a generation most stages ask once; choose **Ask once per job** for a single question per job.
- **Ask before every request.**
- **Ask once per job.**
- **Never ask.** Everything is still recorded in the send log. The app asks you to confirm this choice and names the cloud providers it applies to.

Embedding requests (when **Embeddings** is routed to a cloud provider) and image, video and voice requests to a cloud media provider are shown and approved the same way. Outside a job (for example a search on the Search page), one approval covers the rest of the app session for that project and provider.

## Redaction

Redaction is on by default for all four categories. Each value becomes a placeholder such as `[[PERSON_7F3K]]`:

- The same value always gets the same placeholder within a project, so the model sees a consistent cast across stages.
- The placeholders are computed with a key that belongs to the project. The key is stored with your API keys in the operating system's keychain, never in the project folder.
- The list of which placeholder stands for which value stays in the app's memory while it runs. It is never written to disk, never logged and never sent.
- Placeholders in the model's reply are changed back to the real values on your computer before anything is saved. The live log during generation shows the placeholders, because that is what the model saw. A placeholder the model invented is left as written and noted in the job log (`REDACTION_UNKNOWN`).

Redaction does not apply to embedding requests: search over placeholders would not work. Image, video and voice prompts are redacted with plain words instead of placeholders (a name becomes "a staff member", a phone number "a phone number"), because images and audio cannot be changed back. A video's input image is shown in the dialog, and the approval covers that exact image.

A value the app has already replaced in a project is replaced again wherever it appears later, even where the patterns would not find it on their own, so a name restored into one stage's result is never sent in the clear by the next stage.

### What it finds, and what it misses

Detection uses patterns and word lists, not a language model:

- **Names**: a title or rank followed by a name ("Chief Dana Ruiz", "Dr. Okafor", "Sgt. Lee"); a common given name followed by a surname; the Name column of contact tables; later mentions of a surname found that way. Words in your roles, agencies, brand names, document titles, city and region are never treated as names.
- **Phone numbers**: North American and international forms with extensions, and the numbers listed under phones in the facility facts. Times, dates, section numbers, ICS form numbers and IP addresses are not phone numbers.
- **Email addresses.**
- **Street addresses**: a house number, a street name and a street suffix, with an optional unit, city, state and ZIP code; PO boxes.

It will miss some values (a name written in capitals, a nickname, an unusual address). Read the highlighted text in the dialog. For repeat misses, add the term to **Always redact**; for terms that should stay (your organization's name, a place), add them to **Never redact**. The **Try redaction** box on the Cloud and privacy page shows the effect on any sample text without sending anything.

## The send log

Every cloud request adds one line to `cloud-sends.jsonl` in the project folder: when, the provider, host and model, the task and stage, which documents and section headings the excerpts came from, the size of each part, how many values were redacted, how the request was approved and a fingerprint (hash) of the request. It never contains the text sent, the redacted values or the placeholder list.

The project's **Cloud and privacy** page lists the log as **Sent to cloud**, with filters by provider, task and date. Requests made outside a project are logged in `cloud-sends.jsonl` in the app's settings folder.
