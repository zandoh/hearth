# Spike: is a "utilities trends" widget worth building within Hearth's scope?

- **Status**: Recommendation ready — **Conditional Go** (see below)
- **Plan**: `plans/011-utilities-widget-spike.md`
- **Author**: advisor spike, 2026-07-07 (planned at commit `a9659c0`)
- **Roadmap item**: `README.md` → Roadmap → "utilities trends"

## TL;DR

A keyless / LAN-local data source **does exist**, so this is not the "no-go"
outcome the plan anticipated. Local energy monitors (Shelly EM family, Fronius
inverters, HomeWizard P1) expose read-only measurements over the household LAN
with **no cloud account and no API key**, which is the same property that keeps
the weather widget in scope.

But the honesty caveat matters: **there is no universal, zero-config source like
Open-Meteo for utility data.** Weather works for every household out of the box;
a utilities widget only works for a household that already *owns* a supported
meter and can point the widget at its LAN address. That makes this an opt-in,
hardware-dependent widget rather than a universal one.

**Recommendation: Conditional Go**, scoped narrowly to LAN-local keyless energy
monitors, built behind a device-adapter seam, with the **Shelly EM family** as
the single reference device for a first cut. Explicitly decline every
cloud/utility-portal path (Green Button, Octopus, Emporia/Sense). If the
maintainer decides the hardware dependency is too niche for Hearth's audience,
the fallback is a clean "defer + ADR" — that is a legitimate call and is
sketched at the end.

## The scope constraint this spike must satisfy

`CONTRIBUTING.md`, "Before you build a feature":

> Hearth's scope is deliberate: calm, glanceable, household-shaped. Features
> that grow **API-key treadmills or corporate-dashboard energy get declined
> kindly** — better to find that out before you've written the code.

The weather widget is in scope precisely because Open-Meteo "needs no API key"
(`internal/widgets/weather/weather.go`, package doc; `openmeteo.go` — "all
keyless GETs returning JSON"). The decisive question for utilities is therefore
**auth model, not feature richness**: any source that requires a per-account key,
OAuth handshake with a utility, or scraping a login-gated portal is the exact
treadmill `CONTRIBUTING.md` rejects, and is out of scope no matter how good its
data is.

## Step 1 — Candidate data sources, classified by the scope test

Classification key: **Keyless/open** and **LAN-local** are in scope;
**per-account key / OAuth / portal-scrape** is out of scope (the treadmill).

| Source | Data provided | Auth model | Class | In scope? |
|---|---|---|---|---|
| **Shelly EM / Pro 3EM / EM Gen3** (clamp energy meter) | Per-phase instantaneous power, voltage, current; accumulated energy; ~60 days at 1-min in device memory | Local HTTP/RPC on LAN; **digest auth disabled by default** (`auth_en:false`) | LAN-local, keyless | **Yes** |
| **Fronius Solar API** (Symo/Galvo inverters + Datamanager) | Real-time PV production, grid import/export, house consumption; JSON | Local JSON over LAN; docs state **"No API security token or authentication is required"** | LAN-local, keyless | **Yes** |
| **HomeWizard P1 Meter** (clips onto EU DSMR smart-meter P1 port) | Grid import/export power, energy totals, gas; updates ~1s (DSMR 5.0) | Local API on LAN; **v1 keyless** (enable "Local API" in app, no token). Note: v2 API adds HTTPS + a token | LAN-local, keyless (v1) | **Yes (v1)** |
| **Home Assistant** (if the household already runs it) | Anything HA already ingests, incl. its Energy dashboard; REST + WebSocket | LAN reachable, but **requires a long-lived access token** (per-instance, self-issued) | LAN-local, token-gated | Borderline — token is self-issued per-instance, not a corporate account, but it *is* a key |
| **Enphase IQ Gateway / Envoy** (solar) | PV production/consumption; local `/ivp/...` endpoints | LAN, but firmware 7.x (D7) now **requires a token** for all local API access | LAN-local, token-gated | Borderline / drifting toward treadmill |
| **Emporia Vue / Sense** (whole-home monitors) | Circuit-level energy; good data | **Cloud-only**; no local API; unofficial libs need account email+password | Per-account cloud | **No** |
| **Green Button Connect My Data** (US utilities) | Interval consumption + cost from the utility of record | **OAuth 2.0 per-account**, third-party client_id/secret, utility authorization redirect | Per-account OAuth | **No** |
| **Octopus Energy API** (UK) | Half-hourly consumption + tariff/cost | **Personal API key + account number**, HTTP Basic | Per-account key | **No** |
| **Utility web portals (generic)** | Monthly/interval usage + bills | Login-gated; would require scraping | Portal-scrape | **No** |

**Reading of the table.** The out-of-scope rows are exactly the sources that
give the "best" data — real billed cost from the utility of record — because
that data is inherently private and therefore per-account gated. There is **no
keyless public API for a household's own utility-meter/billing data**, and there
almost certainly never will be, because it is personal account data. The
in-scope rows are all **on-premises hardware the household owns**, read locally,
which is why they can be keyless.

## Step 2 — Recommendation: Conditional Go

This is **not** the STOP condition "only viable sources are key-gated/scraped."
Genuinely keyless LAN-local sources exist (Shelly's default-no-auth RPC,
Fronius's no-token JSON, HomeWizard P1 v1). So a "go" does **not** require
stretching scope.

**Recommend building it, with these guardrails:**

1. **LAN-local, keyless only.** Ship against on-premises energy monitors read
   over the household network. Never add a cloud utility source, OAuth, or
   portal scraping — those are the treadmill and stay permanently out of scope.
2. **One reference device first: the Shelly EM family.** Rationale: it is
   clamp-based so it works on *any* electrical panel worldwide (Fronius requires
   solar; HomeWizard P1 requires an EU DSMR meter), its Gen2 local RPC has
   authentication **disabled by default**, and it exposes both instantaneous
   power and accumulated energy — enough for a glanceable "current draw + today's
   usage + trend" card.
3. **Device-adapter seam from day one** so Fronius, HomeWizard P1, and
   (token-permitting) Home Assistant can be added later without reshaping the
   widget — exactly how weather isolates Open-Meteo behind `meteoAPI`.

**Why this is honest about the tension, not a stretch:** the widget is *opt-in
and hardware-dependent*. Unlike weather, zero households get it for free — it is
useful only to a household that already owns a compatible meter and can supply
its LAN address. That is a narrower audience, but it is squarely the
**self-hosted, household-shaped** audience Hearth already serves, and the plan
itself names LAN-local sources as "a strong fit for the self-hosted ethos." The
maintainer's real decision is therefore *audience/maintenance*, not *scope
purity*: is a widget that only lights up for meter-owning households worth the
device-adapter matrix? If the answer is "not yet," see "If declined" below.

## Step 3 — Widget sketch against the weather seam

Copying `internal/widgets/weather` structure (verified unchanged between the
plan's base commit `a9659c0` and this worktree's HEAD — `git diff --stat` over
`internal/widgets/weather`, `internal/README.md`, `internal/topics`,
`web/src/topics.ts` returned empty).

### Seam interface (the `meteoAPI` analog)

```go
// utilitiesAPI is the seam between the widget and whatever on-LAN energy
// monitor the household configured. energyMonitorClient is the production
// adapter (one per supported device); tests substitute a fake.
type utilitiesAPI interface {
    // reading is a single keyless GET/RPC against the device on the LAN.
    reading(ctx context.Context, dev device) (energyReading, error)
}
```

- **Production adapter(s):** `shellyClient` first (Gen2 RPC: `POST /rpc` with
  `EM.GetStatus` / `Shelly.GetStatus`, or the `GET /rpc/EM.GetStatus?id=0`
  form), std-lib `net/http` only, mirroring `openMeteoClient.getJSON`. Fronius /
  HomeWizard adapters are additive later — "two adapters make the seam real" is
  the house rule (`internal/README.md`), and the test fake is the second
  adapter, same as weather.
- **Test fake:** an in-memory `utilitiesAPI` returning a canned `energyReading`,
  same pattern as the weather fake — no device on the network needed for tests.

### Refresh Job and cached shape

- `Jobs()` returns one `refresh` job. Interval: energy is spikier than weather,
  so **~1 minute** (open question — weather is 15m; see below), still served
  from memory so the kiosk never blocks on the device.
- Cached in-memory shape served to the frontend (the `forecast` analog):

```go
type snapshot struct {
    Device      device    `json:"device"`
    FetchedAt   time.Time `json:"fetchedAt"`
    PowerW      float64   `json:"powerW"`       // current draw
    EnergyToday float64   `json:"energyTodayKwh"`
    Trend       []point   `json:"trend"`        // recent samples for a sparkline
    // optional: PvW / GridW when the device reports solar + grid separately
}
```

- Same `mu sync.RWMutex; cached *snapshot` + `Publish("changed")` on refresh as
  weather. Handler returns `{configured:false}` / `{configured:true,pending:true}`
  / `{configured:true,snapshot:…}`, mirroring `handleForecast`.

### Storage

- A `store.Setting[device]` (typed, JSON on disk) holding the configured device
  **kind + LAN host/port** — the `weather_location` analog. New keys use
  `store.Setting[T]` per `internal/README.md`; no raw legacy key needed.
- **Migration:** none required for a live in-memory trend. A numbered migration
  in `store/migrations/` is only needed if the maintainer wants *historical
  retention* across restarts (open question) — the device itself already holds
  ~60 days (Shelly), so persistence may be unnecessary for a "glanceable" card.

### Topic and the two-sided mirror

- Add `Utilities = "utilities"` to `internal/topics/topics.go` **and**
  `utilities: "utilities"` to `web/src/topics.ts`. The contract test fails until
  both exist (`internal/topics` package doc; `web/src/topics.ts`).

### Frontend shape

- One glanceable read-only card (`UtilitiesWidget.tsx`) + a `utilitiesApi.ts`
  adapter, registered in `web/src/widgets/registry.ts`, following `WeatherWidget`
  / `weatherApi.ts`. Content: current draw (W), today's kWh, a small sparkline of
  recent samples. No interaction beyond a settings panel to enter the device
  kind + LAN address (the `CalendarSettings.tsx` / weather location-picker
  precedent). Read-only, calm, glanceable — no controls, no billing, no cloud.

### Open questions for the maintainer

1. **Device support order** — Shelly-first (universal, clamp-based) confirmed? Or
   is the household's actual hardware Fronius/HomeWizard, which would reorder it?
2. **Refresh interval** — 1 min vs. 5 min. Trade-off: liveliness vs. LAN chatter.
3. **Historical retention** — live in-memory trend only (no migration), or
   persist samples for a longer trend (needs a migration + `store/utilities.go`)?
4. **Units / metrics** — power (W) + energy (kWh) only, or also derived cost?
   Cost needs a tariff, which reintroduces per-account/portal data — recommend
   **staying at kWh** to stay keyless and out of the treadmill.
5. **Device discovery** — manual host entry (simplest, matches keyless ethos) vs.
   mDNS discovery (nicer UX, more code). Recommend manual for v1.

### Coarse effort estimate for the real build (separate plan)

**M** — comparable to the weather widget but simpler data model (no geocoding,
no dual-service AQI). Backend: one adapter + seam + job + handler + typed
setting (~a weather-sized package). Frontend: one card + adapter + settings +
registry + topic mirror. No migration in the minimal cut. The variable cost is
how many device adapters ship in v1 — each additional device is incremental,
which is exactly why the seam matters.

## Step 4 — Throwaway prototype

**Skipped, deliberately.** Step 4 is optional and only worthwhile "if you can
reach" a real device. This spike runs in a sandboxed worktree with no Shelly /
Fronius / HomeWizard meter on the network, so a fetch script would prove
nothing. The data shapes above are taken from vendor API docs (cited in Sources),
not guessed. The follow-up build plan should do this prototype against the
maintainer's actual meter as its first de-risking step, before writing the
adapter.

## If declined — the clean fallback

If the maintainer decides the hardware dependency is too niche (a fair call —
weather is universal, this is not), the resolution is **defer + ADR**, not a
lingering roadmap item. Write a short ADR in `docs/adr/` (following the
`docs/adr/0001` precedent) recording: keyless utility *billing* data does not
exist (it is inherently per-account), the only in-scope sources are LAN-local
energy monitors the household must own, and Hearth defers the widget until
[trigger]. That stops the roadmap item from being re-proposed and re-researched,
which is the whole point of the `0001` precedent ("Future reviews should not
re-propose this").

**What would change the answer toward an unconditional Go:** a keyless public
API for household utility data appearing (unlikely — it is private account data),
or the maintainer's household already running one of the supported LAN meters,
which makes the "opt-in hardware" objection moot for the primary user.

## Sources

- In-repo pattern: `internal/widgets/weather/weather.go`,
  `internal/widgets/weather/openmeteo.go`, `internal/README.md`,
  `internal/topics/topics.go`, `web/src/topics.ts`, `CONTRIBUTING.md`,
  `docs/adr/0001-raw-settings-keep-their-on-disk-shape.md`
- Shelly Gen2 API — [Authentication (auth disabled by default, `auth_en:false`)](https://shelly-api-docs.shelly.cloud/gen2/General/Authentication/),
  [Shelly.GetStatus](https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Shelly/),
  [Shelly EM (local LAN operation, 60-day 1-min memory)](https://kb.shelly.cloud/knowledge-base/shelly-em)
- Fronius — [Solar API (JSON), "no API security token or authentication is required"](https://www.fronius.com/en-us/usa/solar-energy/installers-partners/technical-data/all-products/system-monitoring/open-interfaces/fronius-solar-api-json-)
- HomeWizard — [Local API intro (v1 keyless; v2 adds token)](https://api-documentation.homewizard.com/docs/introduction/),
  [Integrating Energy with other systems](https://helpdesk.homewizard.com/en/articles/5935977-integrating-energy-with-other-systems-api)
- Home Assistant — [REST API + long-lived access token](https://developers.home-assistant.io/docs/api/rest/)
- Enphase — [IQ Gateway local API now requires a token (firmware 7.x/D7)](https://support.enphase.com/s/question/0D53m00008pRVlLCAW/instructions-to-get-access-token)
- Emporia — [No local API; cloud-only](https://help.emporiaenergy.com/en/articles/9084335-is-an-api-available)
- Green Button — [Connect My Data OAuth 2.0 per-account](https://utilityapi.com/docs/greenbutton/oauth)
- Octopus Energy — [REST API needs personal API key + account number](https://docs.octopus.energy/rest/guides/api-basics/)
