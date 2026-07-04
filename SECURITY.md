# Security

## Threat model — read this first

Hearth is **LAN-trust by design**. It is meant to run on a home network,
reachable by the household's devices, with **no authentication** — the same
trust model as a paper calendar on the kitchen wall.

Consequences you should understand before deploying:

- **Do not expose Hearth directly to the internet.** Anyone who can reach
  the port can read and change everything. If you need remote access, put
  it behind something that authenticates — a VPN (Tailscale/WireGuard) is
  the recommended shape.
- **The guest PIN is a social lock, not a security boundary.** It keeps a
  houseguest from wandering out of the guest view; it does not protect
  data from someone with network access.
- Google Calendar credentials live in your `.env`/data volume on your own
  hardware and are never transmitted anywhere except to Google.

Issues that only reproduce by violating the model above (e.g. "an
unauthenticated user on the LAN can…") are working as designed — though
we're open to discussing hardening in Ideas.

## Reporting a vulnerability

For anything that breaks the model *within* it — the guest PIN being
bypassable, SQL injection, XSS via widget content (guest book notes are
adversarial input!), path traversal in the backup/restore endpoints —
please report privately via
[GitHub Security Advisories](https://github.com/zandoh/hearth/security/advisories/new)
rather than a public issue.

You'll get an acknowledgment within a few days. The latest release is the
supported version.
