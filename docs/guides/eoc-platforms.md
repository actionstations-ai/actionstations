# Exercise platforms and real-world alert formats

Action Stations can write the exercise to files other exercise tools read, and it can produce injects in the exact shape of real alerts. Everything stays on your computer; nothing is sent to any platform.

## Alert and notice injects

| Inject type               | Looks like                                                                           | Variants                  |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------------------- |
| `cap_alert`               | The review screen of an alert-origination tool, or the CAP 1.2 XML                   | `review`, `xml`           |
| `eas_broadcast`           | A TV crawl, or an EAS decoder log with the raw SAME header                           | `tv_crawl`, `decoder_log` |
| `notam`                   | FAA NOTAM search result, TFR page, or the ICAO format                                | `text`, `tfr`, `icao`     |
| `nws_weather_warning`     | NWS text product: warnings, follow-up statements, Special Weather Statement, watches | (the `product` field)     |
| `ics_213_general_message` | FEMA ICS 213, blocks 1 to 10 as in the FEMA ICS Forms Booklet (FEMA 502-2)           | `default`, `blank`        |

Every visible character comes from a field or from code. The SAME header, VTEC and UGC lines, CAP times and the ICAO Q line are built by the app from fields, so the model never writes them. CAP alerts are always marked as an exercise (status `Exercise` or `Test`, never `Actual`).

## Export targets ("For other platforms")

All three are off by default and are facilitator material: with the ZIP they go to `facilitator/platforms/`, never `players/`.

- **Conducttr MEL (CSV).** `<Title>-S<n>-conducttr-mel.csv` has the columns of Conducttr's Import MEL template (Day, Serial, Number, Time, From, Faction, To, To type, Team, Method, Subject, Message, Timestamp, Expected Action, Expected Action Title, Expected Action ImageURL). A row to several roles becomes one row per role. `conducttr-media.csv` lists the files to upload, copied to `conducttr-media/`. Status: matched to Conducttr's published documentation; not yet tried in a live import.
- **WebEOC / SimulationDeck package (unverified).** A folder with `msel.xlsx`, `msel.csv`, `injects/` (the text of each inject), `media/` and a README. Juvare publishes no import format for these tools, so the package is a plain mapped MSEL; ask your administrator which board columns to use.
- **CAP 1.2 XML.** `cap/<row id>.xml` for every CAP alert inject, for agencies whose alerting software can import CAP into a training or test environment. Load it only there. The file says it is an exercise in its status, headline and note.

CSV files are UTF-8 with a byte order mark, CRLF line ends, and cells that start with `=`, `+`, `-` or `@` get a leading apostrophe.
