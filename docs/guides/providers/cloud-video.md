# Cloud images and video (fal.ai and Replicate)

Two services are supported: fal.ai and Replicate. Both serve the same two tasks and work the same way in the app; this guide covers fal.ai first, and [Replicate](#replicate) after it.

fal.ai runs current image and video models in the cloud. Connect it when your computer cannot run a local video workflow, or when you want a newer model than your own hardware allows. It serves the **Image** and **Video** tasks. It does not make voices or text.

fal.ai is a cloud provider. Everything below leaves your computer, so it follows the same rules as other cloud providers: it shows the cloud badge, and the app shows what will be sent and asks for approval before the first request ([What goes to cloud models](../privacy.md)).

## What is sent

| Task  | Sent to fal.ai                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| Image | The scene description from the inject's media brief, and the picture size you asked for.                          |
| Video | The video description, what to avoid, the clip length, and **the scene image the app generated for that inject**. |

Names, phone numbers, emails and addresses in the description are replaced with placeholders before sending, as for text models. The scene image is a picture the app made itself from that description; the approval tells you that an image is attached. Nothing else is sent: not your documents, not the rest of the scenario.

Text-bearing injects (tweets, tickets, emails, logs, display boards) never use this: they come from templates, so their text stays exact.

fal.ai keeps a history of your requests (inputs and outputs) in your fal.ai dashboard for 90 days by default, and its result links expire after a while. The app downloads each result immediately and keeps its own copy in the project. See fal.ai's documentation for how to change retention on your account.

## 1. Get an API key

Create an account at fal.ai, add credit, and create an API key in the dashboard. Usage is billed to that account per generation.

## 2. Add the provider

1. **Providers → Add provider → Type: fal.ai.** The address is fixed.
2. Paste the key into **API key**. It is stored encrypted by your operating system and is never shown again.
3. **Add provider**, then **Test** on the card. The test checks that the key works without generating anything, so it costs nothing.
4. In **Routing**, assign the **Image** and **Video** tasks to fal.ai and type a model for each (see below).

## 3. Pick a model

Type the model's id in the Routing table. These are known to the app, so their settings are filled in for you:

| Task  | Model id                                           | Notes                                       |
| ----- | -------------------------------------------------- | ------------------------------------------- |
| Video | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | Kling 2.5 Turbo Pro, 5 or 10 second clips   |
| Video | `fal-ai/kling-video/v3/pro/image-to-video`         | Kling 3 Pro, 3 to 15 seconds                |
| Video | `fal-ai/ltx-2.5/image-to-video/fast`               | LTX 2.5 Fast, 6 to 20 seconds, quick to run |
| Video | `fal-ai/minimax/hailuo-02/standard/image-to-video` | MiniMax Hailuo 02, 6 or 10 seconds          |
| Video | `bytedance/seedance-2.5/us/image-to-video`         | Seedance 2.5, 4 to 30 seconds               |
| Video | `fal-ai/kling-video/v2.5-turbo/pro/text-to-video`  | Kling 2.5, from the description alone       |
| Image | `fal-ai/flux/schnell`                              | FLUX.1 schnell, fast and the cheapest       |
| Image | `fal-ai/flux-pro/v1.1`                             | FLUX 1.1 pro, higher quality                |
| Image | `fal-ai/flux-2`                                    | FLUX.2                                      |

Tips for choosing:

- Start with a fast, low-cost model to see the result for your scenario, then move up.
- Prefer an **image-to-video** model. The clip starts from the scene image the app already generated, so the video matches the still shown in the inject. A model that needs a starting image cannot run when no scene image exists.
- The scene image is sent inside the request, so a large one is shrunk first (to about 1 MB for fal.ai) by saving a smaller JPEG copy. The inject keeps its original image. If it cannot be made small enough, the job stops with "The starting image is too large for this service".
- The clip length in the media brief is rounded to the nearest length the model accepts (a 7 second request becomes 5 seconds on Kling 2.5).
- Model ids and what they offer change on fal.ai. If a model is retired, pick another from fal.ai's model gallery.

### Other models

Any fal.ai model id works. Each model names its inputs differently, so for a model the app does not know, open **Video model inputs** in the provider form, type the model's id, and fill in the input names from the model's API page on fal.ai: the prompt, the optional negative prompt, the starting image, the clip length (and the lengths it accepts), and the aspect ratio. Inputs you leave empty are not sent. Without any mapping, only the description is sent, which is enough for most text-to-video and text-to-image models.

## Cost

fal.ai bills each generation to your account. Prices depend on the model and, for video, the clip length and quality, and they change, so check the price on the model's page. Video is the expensive part: a scenario with many video injects can add up.

To see an estimate before a batch starts, open **Advanced** in the provider form and enter a price per image and per video clip in US dollars. Before a batch of image or video generation, the app then shows how many calls it will make and the estimated total, and asks you to confirm. Without prices it still shows the number of calls.

A cost-conscious setup: templates for text-bearing injects (free), a local or low-cost image model for scenes, and cloud video only for the few injects that need motion.

## While a job runs

Each job appears in the jobs tray with its place in fal.ai's queue and progress. **Cancel** stops it, and the app also asks fal.ai to stop the job so you are not charged for work you cancelled where possible. A video that takes longer than 15 minutes (3 minutes for an image) is cancelled and reported as failed.

The app only downloads a result from a secure (https) address given in fal.ai's answer, up to 200 MB for a video and 30 MB for an image, and only if the file really is a video or an image.

## Troubleshooting

| Symptom                                             | Fix                                                                                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| "fal.ai rejected the API key"                       | The key is wrong or revoked. **Edit → Replace** the key.                                                                                            |
| "account has no credit left"                        | Add credit in your fal.ai dashboard and run the step again.                                                                                         |
| "rate limiting requests or its queue is full"       | Wait a minute and retry, or run fewer clips at once.                                                                                                |
| "does not have that model"                          | The model id is misspelled or the model was retired. Copy the id from the model's page on fal.ai.                                                   |
| "did not accept the request or refused the content" | The model rejected an input or its safety check refused the content. Reword the description, or check the input names under **Video model inputs**. |
| "needs a starting image"                            | You chose an image-to-video model but the inject has no scene image. Enable image generation for the inject, or pick a text-to-video model.         |
| Job stays "Waiting in line"                         | fal.ai's queue is busy. It is cancelled after 15 minutes; try a faster model.                                                                       |

## Replicate

Replicate runs many image and video models in the cloud, billed to your Replicate account. It serves the **Image** and **Video** tasks, works like fal.ai above (same approval step, same cloud badge, same jobs tray), and does not make voices or text.

### What is sent

The same as for fal.ai: the scene description (with names, phone numbers, emails and addresses replaced by placeholders), the clip length and what to avoid for video, and, for an image-to-video model, the scene image the app generated for that inject. Nothing else is sent. Replicate removes the inputs and results of requests made through its API after an hour; the app downloads each result at once and keeps its own copy in the project.

### Set up

1. Create an account at replicate.com, add a payment method or credit, and create an API token in your account settings.
2. **Providers → Add provider → Type: Replicate.** The address is fixed. Paste the token into **API key**.
3. **Add provider**, then **Test** on the card. The test only reads your account, so it costs nothing.
4. In **Routing**, assign the **Image** and **Video** tasks to Replicate and type a model for each, written as `owner/name`.

### Models

These are known to the app, so their settings are filled in for you:

| Task  | Model                            | Notes                                                |
| ----- | -------------------------------- | ---------------------------------------------------- |
| Video | `kwaivgi/kling-v2.5-turbo-pro`   | Kling 2.5 Turbo Pro, 5 or 10 seconds, text or image  |
| Video | `bytedance/seedance-1-pro-fast`  | Seedance 1 Pro Fast, 2 to 12 seconds, text or image  |
| Video | `minimax/hailuo-02`              | Hailuo 02, 6 seconds, starts from the scene image    |
| Video | `wan-video/wan-2.5-i2v-fast`     | Wan 2.5 Fast, 5 or 10 seconds, needs the scene image |
| Video | `google/veo-3.1-fast`            | Veo 3.1 Fast, 4, 6 or 8 seconds, text or image       |
| Video | `lightricks/ltx-2-fast`          | LTX 2 Fast, 6 to 20 seconds                          |
| Image | `black-forest-labs/flux-schnell` | FLUX.1 schnell, fast and the cheapest                |
| Image | `black-forest-labs/flux-1.1-pro` | FLUX 1.1 pro, higher quality                         |
| Image | `google/imagen-4-fast`           | Imagen 4 Fast                                        |

The tips for fal.ai models apply here too: start with a fast model, prefer image-to-video so the clip matches the still in the inject, and expect the clip length to be rounded to a length the model accepts. Replicate's model pages list what each model offers; models come and go, so pick another if one is retired.

Any model from Replicate's official collection works. For a model the app does not know, open **Video model inputs** in the provider form, type the model name and fill in the input names from the model's API page, as described under [Other models](#other-models). Lengths are sent as whole numbers, which is what Replicate models expect.

### Cost, progress and limits

Replicate bills each generation to your account, and prices differ by model, so check the model's page. Enter per-call prices under **Advanced** to see an estimate before a batch, as for fal.ai.

Short jobs finish within a single request. Longer ones show progress in the jobs tray until they finish. **Cancel** stops the job, and the app also asks Replicate to stop it. A video that takes longer than 15 minutes (3 minutes for an image) is cancelled and reported as failed. Downloads are limited to 200 MB for a video and 30 MB for an image, and only a real video or image is accepted.

Replicate takes the scene image inside the request, and only a small one (about 250 KB). The app shrinks the image for you: it saves it again as a JPEG, lowering the quality and, if needed, the size (never above 1280 pixels on the long side). The picture you see in the inject is not changed. If the image still cannot be made small enough, the job stops with "The starting image is too large for this service" and nothing is sent.

### Troubleshooting

| Symptom                               | Fix                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| "Replicate rejected the API token"    | The token is wrong or revoked. **Edit → Replace** the key.                                                                      |
| "needs billing set up or more credit" | Add a payment method or credit in your Replicate account and run the step again.                                                |
| "does not have that model"            | The name is misspelled or the model is not available. Copy it from the model's page.                                            |
| "rate limiting requests"              | Wait for the time shown, or run fewer clips at once. A new account with little credit is limited more strictly.                 |
| "refused the content"                 | Replicate's safety check flagged the description. Reword it.                                                                    |
| "did not accept the request"          | The model rejected an input. Check the input names under **Video model inputs**.                                                |
| "could not make the video"            | The model failed; the reason Replicate gave follows. Try again or pick another model.                                           |
| "needs a starting image"              | The model needs the scene image and the inject has none. Enable image generation for the inject, or pick a text-to-video model. |
