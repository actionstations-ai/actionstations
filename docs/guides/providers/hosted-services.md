# Other hosted services

Besides [OpenAI](openai.md), [Google Gemini](gemini.md) and [Anthropic](anthropic.md), the app can use these hosted services for writing. Each one is a cloud service: **prompts, retrieved excerpts of your documents and the scenario so far are sent to that company** for every stage routed to it, and you pay the company directly. Before anything is sent, the app shows the request and asks for your approval, and it replaces names, phone numbers, emails and addresses with placeholders by default: see [What goes to cloud models](../privacy.md).

| Service      | Type in the form | What it is                                                |
| ------------ | ---------------- | --------------------------------------------------------- |
| OpenRouter   | OpenRouter       | One key for models from many makers, billed by OpenRouter |
| Mistral      | Mistral          | Models from Mistral AI                                    |
| Groq         | Groq             | Open models run on Groq's fast hardware                   |
| DeepSeek     | DeepSeek         | Models from DeepSeek                                      |
| xAI          | xAI              | Grok models                                               |
| Together AI  | Together AI      | Many open models, billed by Together                      |
| Azure OpenAI | Azure OpenAI     | Models you deploy in your own Microsoft Azure resource    |

The generic **OpenAI-compatible** type stays available for any other server that speaks the same protocol.

## Set up

1. Create an API key on the service's website and make sure the account can be billed.
2. **Providers → Add provider** and choose the service from **Type**. The address and a suggested model are filled in. The suggestion is only a starting point: change it to any model the service offers.
3. Paste the key into **API key**. It is required for these services.
4. **Add provider**, then **Test**. The test asks the service for its model list, not for a generated answer, so it costs nothing. After the provider is saved, the model field offers the models your key can use.
5. In **Routing**, assign the tasks you want this service to run.

## Azure OpenAI

Azure runs models in a resource you create in your own Azure account, so there is no shared address.

1. In Azure, create or open an Azure OpenAI (Foundry) resource and deploy a model. Note the resource name, the **deployment name** and one of the resource's keys.
2. In the form, choose **Azure OpenAI** and replace `YOUR-RESOURCE` in the base URL with your resource name. The address looks like `https://my-resource.openai.azure.com/openai/v1/`.
3. Enter the **deployment name** as the model, not the model family.
4. Paste the key. Azure keys are sent in the `api-key` header, which the app does automatically.
5. If your organization uses a deployment address (`.../openai/deployments/<name>`) instead, put that in the base URL and open **Advanced** to enter the **API version** your Azure resource expects, such as `2024-10-21`. The version is added to every request. Leave it empty for the current address shown above.

## OpenRouter

The app sends the name "Action Stations" and its website address with each request so OpenRouter can show where traffic comes from. These are not secret and carry no project data. Model names look like `maker/model`; use **Load models** in the model field to see what is available.

## What it costs

You pay each service directly, usually per token. The app adds no cost of its own and does not know current prices. Open **Advanced** in the provider form to enter the **Input price** and **Output price** in US dollars per million tokens from the service's price list. With both set, each stage shows its estimated cost; without them it shows tokens only and says the price is not set. OpenRouter and Together publish prices per model, so enter the price of the model you chose.

## Embeddings

Services that offer an embeddings endpoint can index your documents too. In **Routing**, give the **Embeddings** row the provider and one of its embedding models, then choose **Configured provider** under **Settings → Embeddings**. Your document text is sent to that service while it is indexed, and changing the embedding provider means the index must be rebuilt (**Rebuild index** on the project's Documents page). Not every service has embeddings: if a request fails with "not found", choose a different provider for that row.

## Troubleshooting

| Symptom                                     | Fix                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Test** says the key is not valid          | The key is wrong or revoked, or belongs to another service. **Edit → Replace** the key.                      |
| "Model not found" or "deployment not found" | The model name is wrong. For Azure it must be the deployment name. Choose one from the model list.           |
| Out of credit or quota errors               | Add credit on the service's website.                                                                         |
| Rate limit errors                           | The app waits for the time the service gives and retries. If they persist, route fewer tasks to the service. |
| Structured answers keep failing             | Open **Advanced** and set **JSON mode** to **JSON object** or **Ask in the prompt only**.                    |
