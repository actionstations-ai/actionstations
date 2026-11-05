# ADR-0145: Space weather is a toolkit plus a small domain, and it copies SWPC layouts instead of encoding issuance thresholds

Date: 2026-11-05 · Status: Accepted · Issues: #811 · Spec: [0468](../specs/0468-space-weather.md) · Related: ADR-0074 (toolkits)

## Context

Utilities, telecom, aviation, farms, rail, ports and satellite operators all act on the same Space
Weather Prediction Center (SWPC) products, so the expertise is a toolkit. A small set of organizations
(a reliability coordinator or transmission operator control room, a satellite operations center, a
GNSS timing and network team) work through it as their main job. SWPC's own pages disagree on exactly
when watches and warnings are issued for each level.

## Decision

- **Toolkit `space_weather` plus domain `space_weather`.** The toolkit carries products, knowledge,
  figures, data, decisions and metrics for any domain. The domain carries three variants as role teams
  and seven threat families with phase arcs. Both ship in one pack, `ai.actionstations.space-weather`.
- **Family ids are prefixed `space_`.** The default is `space_geomagnetic_storm`. Service degradation
  is split into GNSS and timing loss, satellite anomaly, and information service degradation, so each
  has an arc that matches its clock.
- **Copy products, do not encode thresholds.** Templates and lint rules use the message codes, layouts
  and level mappings a product states (G to Kp, R to X-ray class, S to proton flux). No rule decides
  when SWPC issues a watch or a warning.
- **Impacts stay at the level of decisions.** The knowledge forbids engineering advice about protection
  settings, radiation doses and commanding detail. Scale levels are potential effects, arrival time is
  uncertain by hours, and the toolkit never presents a simulated level as an NOAA product.

## Consequences

- A change in SWPC's layouts is a template and fixture change, not a logic change.
- Readers who know a utility's procedure will find the toolkit stops short of settings by design.
