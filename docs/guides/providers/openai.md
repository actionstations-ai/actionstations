# OpenAI

The OpenAI provider sends generation requests to OpenAI's GPT models. It leaves your computer: **prompts, retrieved excerpts of your documents and the scenario so far are sent to OpenAI** for every stage routed to it, and OpenAI bills your account. Use project routing to keep sensitive projects on local models. Before anything is sent, the app shows the request and asks for your approval, and it replaces names, phone numbers, emails and addresses with placeholders by default: see [What goes to cloud models](../privacy.md).

## 1. Get an API key

Create a key in the [OpenAI platform](https://platform.openai.com) under **API keys**, and make sure the account has credit. The key is separate from a ChatGPT subscription.

## 2. Add the provider

1. **Providers → Add provider → Type: OpenAI.** The base URL and a suggested model are filled in.
2. Paste the key into **API key**. It is required.
3. Keep the suggested **Default model** or pick another. After the provider is saved, the model field offers the models your key can use.
4. **Add provider**, then **Test** on the card. The test asks for your list of models, not for a generated answer, so it costs nothing.
5. In **Routing**, assign the tasks you want OpenAI to run.

## Embeddings

OpenAI can also index your documents for search. In **Routing**, give the **Embeddings** row the OpenAI provider and the model `text-embedding-3-small`, then choose **Configured provider** under **Settings → Embeddings**. Your document text is sent to OpenAI while it is indexed. Changing the embedding provider means the index must be rebuilt: use **Rebuild index** on the project's Documents page.

## Images

OpenAI can draw the photographic scene images for injects. Text-bearing media such as posts, tickets, emails and boards are always drawn from templates, so their text stays exact.

1. Edit the OpenAI provider, open **Advanced** and enter an **Image model**, for example `gpt-image-1`. Check OpenAI's model list for the current names.
2. In **Routing**, give the **Image** row the OpenAI provider. The model you choose on that row is used instead of the one in **Advanced**.
3. Optionally set **Price per image, voice or video call** in **Advanced**, so the app can estimate the cost of a batch.

Each image prompt is shown for approval and redacted like any other request before it is sent. The image is saved in the project; it is 1536 by 1024 pixels for scene images and 1024 by 1536 for portraits, because those are the sizes OpenAI offers. Before a batch of paid images starts, the app tells you how many calls it will make and asks you to confirm.

If OpenAI refuses a prompt because of its content rules, the app says so; reword the image prompt and try again.

## Voices

OpenAI can also speak audio injects. Enter a **Speech model** in **Advanced** (or choose one on the **Audio** row in **Routing**) so the same provider can write text and speak. OpenAI's current speech models shut down on January 6, 2027; check OpenAI's model list for their replacement before then. Each speaker role can use its own voice. The app asks for WAV audio and passes the voice description from the scenario as OpenAI's speaking instructions.

## How the key is stored

The key is encrypted with the operating system's keychain and kept only on this computer. It is never written to the settings file, a project folder or a log, and it is sent only to OpenAI. After saving, the form shows only that a key is set, with **Replace** and **Remove**.

## What it costs

OpenAI charges per token, to your account. The app adds no cost of its own. Prices change, so the app does not know them. To see an estimated cost on each stage, open **Advanced** in the provider form and enter the **Input price** and **Output price** in US dollars per million tokens from OpenAI's price list. With both set, each stage shows its estimated cost and the scenario page shows a total. Without them, stages show their tokens and say the price is not set.

For scale, one scenario uses about 130,000 input tokens and 25,000 output tokens across its stages, and inject text adds more. At a price of 1 dollar per million input tokens and 5 dollars per million output tokens that is about 25 cents. Treat any figure as an estimate: your OpenAI usage page has the real numbers.

## Advanced

- **JSON mode.** The app asks for structured answers in the strictest form first and falls back by itself. Change this only if the service rejects the automatic choice.
- **Price per image, voice or video call.** Used to estimate the cost of media batches.

## Troubleshooting

| Symptom                               | Fix                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Test** says the key is not valid    | The key is wrong, revoked or from another account. **Edit → Replace** the key.                                    |
| "You exceeded your current quota"     | The account has no credit left. Add credit on the OpenAI platform.                                                |
| "Model not found" or "does not exist" | The key cannot use that model. Open the model field and choose one from the list.                                 |
| Rate limit errors                     | The app waits and retries. If they persist, route fewer tasks to OpenAI or ask OpenAI to raise the account limit. |
