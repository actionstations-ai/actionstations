---
name: fixture_overview
stage: scenario_overview
version: 1
description: Test fixture for the prompt library (not a shipped prompt).
task: draft
variables: [project, scenario, retrieved, objectives]
---

Human notes before the first marker are dropped from the rendered prompt.

<!-- @system -->

You are an exercise designer for {{project.orgName}} following HSEEP.
Return JSON only.

<!-- @context -->

{{#each retrieved}}[{{documentTitle}} p.{{page}}] {{text}}
{{/each}}

<!-- @user -->

Write the overview for "{{upper scenario.title}}".
Objectives:
{{bullets objectives}}
Threat: {{default scenario.threatType "unspecified"}}
