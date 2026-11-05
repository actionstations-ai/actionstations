# Google Gemini

The Google Gemini provider sends generation requests to Google's Gemini models through Google's OpenAI-compatible endpoint. It leaves your computer: **prompts, retrieved excerpts of your documents and the scenario so far are sent to Google** for every stage routed to it. Use project routing to keep sensitive projects on local models. Before anything is sent, the app shows the request and asks for your approval, and it replaces names, phone numbers, emails and addresses with placeholders by default: see [What goes to cloud models](../privacy.md).

## 1. Get an API key

Create a key in [Google AI Studio](https://aistudio.google.com) under **Get API key**. Some models have a free tier with low limits; check the current terms on Google's pricing page before you rely on it, because Google may use content sent on a free tier to improve its products. A paid account is the safer choice for exercise material.

## 2. Add the provider

1. **Providers → Add provider → Type: Google Gemini.** The address `https://generativelanguage.googleapis.com/v1beta/openai/` and a suggested model are filled in.
2. Paste the key into **API key**. It is required.
3. Keep the suggested **Default model** or pick another. After the provider is saved, the model field offers the models your key can use.
4. **Add provider**, then **Test** on the card. The test asks for your list of models, not for a generated answer.
5. In **Routing**, assign the tasks you want Gemini to run.

## Embeddings

Gemini can also index your documents for search. In **Routing**, give the **Embeddings** row the Gemini provider and the model `gemini-embedding-001`, then choose **Configured provider** under **Settings → Embeddings**. Your document text is sent to Google while it is indexed. Changing the embedding provider means the index must be rebuilt: use **Rebuild index** on the project's Documents page.

## How the key is stored

The key is encrypted with the operating system's keychain and kept only on this computer. It is never written to the settings file, a project folder or a log, and it is sent only to Google's Gemini host. After saving, the form shows only that a key is set, with **Replace** and **Remove**.

## What it costs

Google charges per token on a paid account. The app adds no cost of its own and does not know current prices. To see an estimated cost on each stage, open **Advanced** in the provider form and enter the **Input price** and **Output price** in US dollars per million tokens from Google's price list. Without them, stages show their tokens and say the price is not set.

## Troubleshooting

| Symptom                            | Fix                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Test** says the key is not valid | The key is wrong or was deleted in AI Studio. **Edit → Replace** the key.                             |
| "Model not found"                  | Google retires older models. Open the model field and choose one from the list.                       |
| Rate limit or quota errors         | Free tiers allow few requests per minute. Wait, route fewer tasks to Gemini, or enable billing.       |
| An answer is blocked or empty      | Google's safety filters refused the content. Rephrase the prompt or use another model for that stage. |
