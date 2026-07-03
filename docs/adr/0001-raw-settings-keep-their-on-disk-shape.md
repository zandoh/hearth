# ADR-0001: Raw settings keep their on-disk shape

## Status
Accepted (2026-07-03)

## Context
`store.Setting[T]` is the typed settings codec: JSON on disk, "absent means
unset". Three settings predate it and are stored as raw strings:
`guest_pin_hash` (hex SHA-256), `guest_view_id` (decimal int), and the
weather units value. Unifying everything under `Setting[T]` looks like an
obvious cleanup — architecture reviews keep rediscovering it.

## Decision
The raw keys stay raw. New settings use `Setting[T]`; existing keys never
change their on-disk representation.

## Consequences
- Live household databases upgrade across versions without a settings
  migration; a codec change here would silently break every existing
  install's guest PIN and view designation.
- `internal/server/guest.go` parses `guest_view_id` by hand. That asymmetry
  is the cost, and it is deliberate.
- Future reviews should not re-propose this migration; a schema-migration
  path (read-raw-write-typed) would be required to revisit it, and nothing
  currently justifies that risk.
