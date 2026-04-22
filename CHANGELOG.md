# Changelog

All notable changes to the OC Lock protocol and reference SDK.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
- Reference SDK in TypeScript (`packages/core`, `packages/crypto`, `packages/device`)

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
