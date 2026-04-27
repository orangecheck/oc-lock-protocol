# OC Lock Protocol

**Bitcoin-identity-bound end-to-end encryption.**

OC Lock is a protocol for encrypting messages and files such that only the holder of a specific Bitcoin address can decrypt them — without wallet-adaptor crypto tricks, without on-chain transactions for the normal case, and without publishing raw pubkeys out-of-band.

It is the successor to the original **LOCK Protocol** (2024–2025), which tried to enforce access control through adaptor signatures and proof-of-access Bitcoin transactions. That design was cryptographically interesting and practically dead on arrival: recipients had to publish BIP-322 signatures before they could receive anything, senders had to broadcast binding transactions, unlocks required PSBT round-trips with desktop wallets, and the WASM crypto libraries needed for adaptor signatures simply didn't exist for the browser. See [`WHY.md`](./WHY.md) for the full postmortem.

OC Lock v2 starts from a different premise: **onboarding is the protocol**. If a user can't lock or unlock a message in under a minute with a wallet they already have, nothing else matters.

## This repo

This repository is the **normative protocol specification**. No code lives here — only:

| File | What it is |
|---|---|
| [`SPEC.md`](./SPEC.md) | The normative v2 specification — envelope format, canonicalization, binding statements, error codes, compliance checklist. |
| [`PROTOCOL.md`](./PROTOCOL.md) | Narrative walkthrough with flow diagrams (identity mode, payment mode, multi-device, self-vaults). |
| [`WHY.md`](./WHY.md) | Postmortem of the original LOCK Protocol. Why v1 failed. What v2 keeps and discards. |
| [`LIFECYCLE.md`](./LIFECYCLE.md) | Normative lifecycle stance — device-record rotation (NIP-33 replacement) and revocation (`device_pk == "revoked"`, in-spec); sealed envelopes are non-revocable, bounded only by `expires_at`. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Version history. |

## Reference implementation

The TypeScript reference implementation is published to **npm**, maintained in the `oc-packages` monorepo:

| Package | npm | Purpose |
|---|---|---|
| [`@orangecheck/lock-crypto`](https://www.npmjs.com/package/@orangecheck/lock-crypto) | ![npm](https://img.shields.io/npm/v/@orangecheck/lock-crypto?label=) | X25519 ECDH + HKDF-SHA256 + AES-256-GCM primitives. |
| [`@orangecheck/lock-core`](https://www.npmjs.com/package/@orangecheck/lock-core) | ![npm](https://img.shields.io/npm/v/@orangecheck/lock-core?label=) | Envelope canonicalization, `seal()`, `unseal()`. Loads `test-vectors/` for conformance. |
| [`@orangecheck/lock-device`](https://www.npmjs.com/package/@orangecheck/lock-device) | ![npm](https://img.shields.io/npm/v/@orangecheck/lock-device?label=) | Device-key binding statements + Nostr kind-30078 publication. |

```
npm i @orangecheck/lock-core
# (pulls @orangecheck/lock-crypto transitively)
```

## Test vectors

The [`test-vectors/`](./test-vectors/) directory holds cross-implementation conformance fixtures. Each vector is a fixed envelope plus the device secrets needed to decrypt it. A conforming implementation unseals every vector envelope against every listed recipient and recovers the stated plaintext. See [`test-vectors/README.md`](./test-vectors/README.md).

## Reference web client

A live reference implementation of OC Lock v2 runs at **[lock.ochk.io](https://lock.ochk.io)** (closed-source web client; the underlying protocol implementation is published as [`@orangecheck/lock-*`](https://www.npmjs.com/org/orangecheck) on npm).

## How it works (one paragraph)

Every OC Lock user has a Bitcoin address and an [OrangeCheck](https://ochk.io) attestation bound to it. On first use in a browser, the user generates an X25519 device keypair and binds it to their Bitcoin identity with a single BIP-322 signature. The public half of that device key is published to Nostr (kind `30078`, deterministic d-tag). To send a message, you fetch the recipient's device pubkey from Nostr by their Bitcoin address or OC attestation id, derive a shared secret via X25519, and encrypt with AES-256-GCM. To receive, you look up your own device key in IndexedDB and decrypt. No servers. No chain transactions. No PSBT.

For commerce flows ("pay 10k sats to unlock this file"), OC Lock defines an optional **payment-gated mode** where the vault's content key is held by a relay until a Bitcoin payment to a specific address is observed. The relay is explicit, trust-scoped, and replaceable.

## Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  lock.ochk.io            sender UI, recipient UI, relay UI      │
├─────────────────────────────────────────────────────────────────┤
│  @orangecheck/lock-core       seal/unseal, envelope canonical   │
│  @orangecheck/lock-crypto     X25519 ECDH, HKDF, AES-256-GCM    │
│  @orangecheck/lock-device     device binding + Nostr publish    │
├─────────────────────────────────────────────────────────────────┤
│  OrangeCheck            identity + sybil resistance             │
│  Nostr                  device key directory (kind 30078)       │
│  Bitcoin                address ownership (BIP-322)             │
└─────────────────────────────────────────────────────────────────┘
```

## Related repositories

- [`orangecheck/oc-packages`](https://github.com/orangecheck/oc-packages) — the `@orangecheck/lock-*` packages live here, alongside the rest of the OrangeCheck SDK.
- [lock.ochk.io](https://lock.ochk.io) — hosted reference web client (closed-source).
- [ochk.io](https://ochk.io) — OrangeCheck umbrella site.

## Status

v2.0 — spec-stable.

## Acknowledgements

The LOCK lineage owes an intellectual debt to [**Bram Kanstein**](https://bramk.substack.com/). His work — "Bitcoin is the standard measure of human productivity," Bitcoin as sovereignty layer, and the long-running thread that Bitcoin is not just money but a civilizational primitive — directly shaped the founding premise of this protocol: that Bitcoin's best use beyond payments is as a trustless identity substrate, and that "access as projection of force" becomes cryptographically meaningful only when it costs something real. Many of the philosophical reframings that differentiate v2 from the earlier access-control-via-chain-tx attempts came out of conversations with Bram. Credit where due.

See also the [OrangeCheck](https://ochk.io) identity primitive, which this protocol layers on top of.

## License

The specification and prose are MIT; see [LICENSE](./LICENSE). The reference implementation in `oc-packages` is also MIT.
