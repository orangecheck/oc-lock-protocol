# Changelog

All notable changes to the OC Lock protocol and reference SDK.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — 2026-04

### Added
- **`LIFECYCLE.md`** — normative companion document specifying device-record rotation and revocation (extending `SPEC.md` §3.5) and the non-revocability of sealed envelopes (bounded only by `expires_at`). Clarifies four edge cases for `device_pk == "revoked"`: rotation/revocation race ordering, recovery via fresh `device_id`, the impossibility of unsealing already-delivered envelopes by revoking their device record, and per-device scoping. Reaffirms that dashboard-local hide flags and NIP-09 deletion-request events have no protocol force. No protocol changes; clarification only.
- `SECURITY.md` with threat model, trust assumptions, and report channel.
- §12 "Acknowledgements" in SPEC crediting Bram Kanstein for the "Bitcoin as identity, not access oracle" reframing that shaped v2.

### Clarified (non-breaking)
- §3 "Device keys": strengthened the compliance language to make explicit that implementations MUST verify `binding_sig` before using a device record for encryption. This was already implicit in the previous text; it is now a hard normative requirement with a specific security rationale documented in `SECURITY.md`.

## [2.0.0] — 2026-04

Complete protocol rewrite. **Not compatible with v1.x.**

### Added
- X25519 device-key model with BIP-322 binding (§3)
- Self-contained `.lock` envelope format (§4)
- Nostr kind-30078 device directory (§3.3)
- Identity mode (no on-chain TX required)
- Payment mode with named relay (§4.4)
- RFC 8785 canonicalization with `recipients[]` ordering (§5)
- Compliance checklist (§10)
- Reference SDK in TypeScript, published from [`orangecheck/oc-packages`](https://github.com/orangecheck/oc-packages) as `@orangecheck/lock-crypto`, `@orangecheck/lock-core`, `@orangecheck/lock-device`. This repo is now spec-only; code lives with the rest of the OrangeCheck SDK.

### Removed
- Adaptor signatures
- Proof-of-Access (PoA) validation engine
- Binding transactions
- Client-tracked unlock counters
- `.seal` binary format
- `rebinding` protocol

### Rationale
See [`WHY.md`](./WHY.md) for the full postmortem.

## [1.1.0] — 2025-05 (archived)

Proof-of-Access pivot. Adaptor signatures removed; replaced with on-chain transaction predicates. Never shipped a usable web client.

## [1.0.0] — 2024 (archived)

Adaptor signature model. Specification only; no working browser implementation.
