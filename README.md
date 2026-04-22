# OC Lock

**Bitcoin-identity-bound end-to-end encryption.**

OC Lock is a protocol for encrypting messages and files such that only the holder of a specific Bitcoin address can decrypt them — without wallet-adaptor crypto tricks, without on-chain transactions for the normal case, and without publishing raw pubkeys out-of-band.

It is the successor to the original **LOCK Protocol** (2024–2025), which tried to enforce access control through adaptor signatures and proof-of-access Bitcoin transactions. That design was cryptographically interesting and practically dead on arrival: recipients had to publish BIP-322 signatures before they could receive anything, senders had to broadcast binding transactions, unlocks required PSBT round-trips with desktop wallets, and the WASM crypto libraries needed for adaptor signatures simply didn't exist for the browser. See [`WHY.md`](./WHY.md) for a full postmortem.

OC Lock v2 starts from a different premise: **onboarding is the protocol**. If a user can't lock or unlock a message in under a minute with a wallet they already have, nothing else matters.

## How it works (one paragraph)

Every OC Lock user has a Bitcoin address and an [OrangeCheck](https://ochk.io) attestation bound to it. On first use in a browser, the user generates an X25519 device keypair and binds it to their Bitcoin identity with a single BIP-322 signature. The public half of that device key is published to Nostr (kind `30078`, deterministic d-tag). To send a message, you fetch the recipient's device pubkey from Nostr by their Bitcoin address or OC attestation id, derive a shared secret via X25519, and encrypt with AES-256-GCM. To receive, you look up your own device key in IndexedDB and decrypt. No servers. No chain transactions. No PSBT.

For commerce flows ("pay 10k sats to unlock this file"), OC Lock defines an optional **payment-gated mode** where the vault's content key is held by a relay until a Bitcoin payment to a specific address is observed. The relay is explicit, trust-scoped, and replaceable.

## Layers

```
┌─────────────────────────────────────────────────────────┐
│  oc-lock-web      sender UI, recipient UI, relay UI     │
├─────────────────────────────────────────────────────────┤
│  @oc-lock/core    seal/unseal, envelope canonicalization │
│  @oc-lock/crypto  X25519 ECDH, HKDF, AES-256-GCM         │
│  @oc-lock/device  device keypair binding + Nostr publish │
├─────────────────────────────────────────────────────────┤
│  OrangeCheck      identity + sybil resistance            │
│  Nostr            device key directory (kind 30078)      │
│  Bitcoin          address ownership (BIP-322)            │
└─────────────────────────────────────────────────────────┘
```

## Repo layout

```
oc-lock/
├── README.md           this file
├── SPEC.md             normative v2 specification
├── PROTOCOL.md         narrative walkthrough with flow diagrams
├── WHY.md              postmortem of v1 (adaptor-sig / PoA) and rationale for v2
├── CHANGELOG.md
├── LICENSE             MIT
└── packages/
    ├── core/           @oc-lock/core     - envelope format, seal/unseal
    ├── crypto/         @oc-lock/crypto   - ECDH, HKDF, AEAD primitives
    └── device/         @oc-lock/device   - device-key binding + Nostr directory
```

## Status

v2.0 — spec-stable, reference implementation in `packages/`. The web client lives in a separate repo: [`orangecheck/oc-lock-web`](https://github.com/orangecheck/oc-lock-web).

## License

MIT
