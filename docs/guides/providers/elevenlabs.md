# ElevenLabs

ElevenLabs voices speak your radio calls, voicemails and announcements. It is a cloud service: **the text of each voice line is sent to ElevenLabs** and billed to your ElevenLabs account. The app shows the request and asks for your approval first, and replaces names, phone numbers, emails and addresses with placeholders by default: see [What goes to cloud models](../privacy.md). Nothing about your documents is sent, only the lines to be spoken (and the sound note, if you switch sound effects on).

## 1. Get an API key

Create a key in your ElevenLabs account under **Developers → API keys**. Speech uses the credits of your plan.

## 2. Add the provider

1. **Providers → Add provider → Type: ElevenLabs.** The address is fixed.
2. Paste the key into **API key**. Leave **Default model** empty to use `eleven_multilingual_v2`, or pick another speech model from the list.
3. **Add provider**, then **Test** on the card. The test only checks the key and counts your voices. It generates no speech and uses no credits.
4. In **Routing**, assign **Audio** to ElevenLabs. You can pick a different model on that row.

## 3. Choose voices

Open **Edit** on the provider. The **Voices** table has one row for each role in the open project, plus **Any other speaker**. Choose a voice for each from the voices on your account. A role with no voice of its own uses the one chosen for **Any other speaker**. If that is also empty, the audio step stops and asks you to pick a voice.

The roles show only while a project is open. Choices you make for a role stay saved when you close the project.

## Audio quality

ElevenLabs sends audio at 44.1 kHz by default, which its Pro plan and above include. If you see "Your ElevenLabs plan does not allow this audio format", set **Audio quality** to **24 kHz** in the provider settings.

## Sound effects (optional)

When **Add sound effects when an inject has a sound note** is ticked, an inject whose media brief has a sound note (for example "crowd murmur, PA chime") also gets a short effect track, mixed quietly under the voice. It is off by default, sends the note to ElevenLabs and uses extra credits.

## Messages you may see

| Message                                           | What to do                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| ElevenLabs rejected the API key                   | Paste the key again in **Edit**.                                 |
| Your ElevenLabs credits are used up               | Add credits or wait for your plan to reset.                      |
| ElevenLabs does not know the voice chosen for ... | The voice was removed from your account. Pick another in Voices. |
| ElevenLabs is rate limiting requests              | Wait a minute and run the step again.                            |
| ElevenLabs refused ...                            | The text breaks the service's content rules. Reword the line.    |

Audio from one inject is limited to 50 MB.
