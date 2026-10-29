# Facilitate: recording the hot wash

Facilitate runs the exercise: the clock, the MSEL timeline, the presentation window, ratings
and notes. This page covers recording the hot wash and turning it into quotes for the AAR.

## Before the first recording

1. Open **Settings › Speech to text** and download a model. whisper-base is the default;
   whisper-small is recommended on computers with 16 GB of memory or more. The download is the
   only network request transcription makes, and each file is checked against a pinned hash.
2. To use a whisper.cpp or speaches server instead, add it under **Providers** and choose it
   for **Transcription** in **Providers › Routing**. Only servers on this computer are accepted.

## Record

1. In Facilitate, press **Record hot wash** (or **R**).
2. Confirm that everyone present was told the discussion is being recorded, give the recording
   a title and press **Start recording**. On macOS the system asks for microphone access once;
   if it was turned off, allow Action Stations in System Settings › Privacy & Security ›
   Microphone. On Windows, check Settings › Privacy & security › Microphone.
3. While recording, the bar shows **Recording** or **Paused**, the time, the microphone and the
   input level in words. **R** pauses and resumes, **Shift+R** stops. The window title starts
   with "● Recording", and the presentation screen shows "This discussion is being recorded"
   unless you turn that off under Recordings.

Leaving Facilitate stops the recording. If the app closes while recording, the audio up to the
last second written is kept and the recording is marked **Recovered after the app closed**.

Recorded on a phone? Use **Import audio…** in **Hot wash › Recordings** (wav, mp3, m4a, ogg or
webm, up to 1 GB and two hours).

## Transcribe and mark quotes

1. In **Hot wash › Recordings**, choose the language (multilingual models) and press
   **Transcribe**. Progress and **Cancel** show on the recording; a later **Transcribe**
   continues where it stopped.
2. **Open transcript** lists the segments with recording time and clock time. Play a segment,
   **Edit** its text (the model's text stays visible), set the speaker, **Merge with next** or
   **Split at cursor**.
3. Tick **Quote for the AAR** and link the quote to an objective, MSEL rows and a Core
   Capability. The AAR draft cites quotes as T1, T2, ….
4. **Redact** replaces a segment's text with [redacted] everywhere, including the AAR input.

## Retention

The audio is deleted once its transcript is saved. To keep it (for example to re-check quotes
against the recording), tick **Keep the audio after its transcript is saved** under
Recordings. **Delete audio** removes it at any time and keeps the transcript. New projects
list hot wash audio in their `.gitignore`.
