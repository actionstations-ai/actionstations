# ADR-0064: Co-controller permissions, host-only frames and the SimCell helper seat

## Context

The roster (#440) already let a partner's signature be accepted inside a row prefix and role set, but any controller token could end the session, kick devices, read the device list and send host-only frames to a server that cannot check signatures. Receipts are sealed to the host, so a partner could not see them. A SimCell draft had no way to reach a second person.

## Decision

- A session's first controller token is the host's; further tokens are co-controllers'. Servers and the hub treat a co-controller connection as less than a host: host-only types are refused (`NOT_CONTROLLER`), it gets no device roster and no frames addressed to `controller`, and `end`, `kick`, `join-token` and `controllers` need the host token.
- Roster entries carry explicit `permissions` (families of frames). Absent means release and recall only. Players' pages and the host enforce it with the signature and the row and role scope.
- `partner.receipt` (host to one partner connection, staff key, signed, role only) carries receipts back. `simcell.draft` and `simcell.action` carry drafts to a proven SimCell seat and its decision back. Both host-to-device types are host-only, staff-sealed and addressed to one client.
- The SimCell helper changes nothing about who sends: its decision is applied by the host as the facilitator's own `resolve`, only while the switch is on and only for a draft offered to that device.
- A LAN session has no second controller connection, so partners join through the relay or a self-hosted server.

## Consequences

Existing hubs treat unflagged controller connections as the host, so nothing else changes. A leaked partner invite gives that partner's scope and the staff key, no more; it is shown once and never stored. Co-controller connections over LAN are a possible later step.
