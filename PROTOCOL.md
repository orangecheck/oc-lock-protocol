# OC Lock — Protocol walkthrough

This is a narrative companion to [SPEC.md](./SPEC.md). If you want the normative rules, read the spec. If you want to understand *why* and *how*, read this.

## The problem

> "I want to send Alice an encrypted message, and I want to prove to her it's from me, and I want to know that only she — specifically, the holder of her Bitcoin address — can open it."

That is the user story OC Lock serves. It sounds simple. In practice, every Bitcoin-native attempt at solving it has failed on UX:

- **PGP**: works, but requires key management mastery that ~1% of users have.
- **LOCK v1 (adaptor signatures)**: elegant on paper, but no browser-compatible WASM library ever shipped and the desktop PSBT loop was unusable for non-technical users.
- **LOCK v1.1 (Proof-of-Access via Bitcoin TX)**: removed adaptor signatures but still required every vault creation and every unlock to be a Bitcoin transaction. 10-minute confirmations, fee estimation, and exact-amount matching killed adoption.

OC Lock v2 makes the boring choice: **treat Bitcoin as an identity system, not an access-control oracle**. The chain proves who owns what address; the encryption is plain old authenticated public-key crypto. Payment-gated access is preserved as an optional layer, not the baseline.

## The mental model

```
  ┌──────────┐  sign binding  ┌──────────┐  publish   ┌──────────────────┐
  │ Wallet   │──────────────→│ Browser  │───────────→│  Nostr directory  │
  │ (UniSat, │ (BIP-322 once)│ device_pk│  kind 30078 │  keyed by bc1... │
  │ Xverse…) │                │ (X25519) │            │                   │
  └──────────┘                └──────────┘            └──────────────────┘
                                                                 │
                                                                 │ fetch by addr
                                                                 ↓
  ┌──────────┐                ┌──────────┐            ┌──────────────────┐
  │ Sender's │  X25519 ECDH  │ content  │  encrypt   │  .lock envelope  │
  │ browser  │──────────────→│  key     │───────────→│  (JSON, share    │
  │          │                │          │            │   anywhere)      │
  └──────────┘                └──────────┘            └──────────────────┘
```

Every user does exactly one "hard" thing, and only once: they sign a BIP-322 message with their Bitcoin wallet that binds a browser-generated X25519 key to their Bitcoin address. After that, sending and receiving are one click.

## Flow 1 — Alice sends Bob a message (identity mode)

### Bob's one-time setup

1. Bob visits `oc-lock.example` in a new browser.
2. He enters his Bitcoin address (or signs in via OrangeCheck).
3. The browser generates a fresh X25519 keypair. The secret half is stored in IndexedDB and never leaves.
4. The browser builds a **binding statement**:
   ```
   oc-lock:device-bind:v2
   address: bc1qalice...
   device_pk: 7d2f...
   device_id: a8b4...
   created_at: 2026-04-22T14:03:11Z
   ```
5. Bob's wallet signs the statement with BIP-322. One signature prompt. One click.
6. The browser publishes a Nostr event (kind 30078) containing the statement, the `device_pk`, and the signature. The event's `d` tag is `oc-lock:device:bc1qalice...` so anyone can find it by Bitcoin address.

Bob is now "addressable". Anyone who knows his Bitcoin address can send him an encrypted message without asking him anything.

### Alice sends

1. Alice types Bob's Bitcoin address into the "To" field.
2. The app fetches Bob's device record from Nostr. Verifies the binding BIP-322 signature against `bc1qalice...`. If the signature doesn't match, the address is rejected with a clear error.
3. Alice writes her message (or drops a file).
4. The browser:
   - Generates a random `content_key` (32 bytes)
   - Encrypts the payload with AES-256-GCM using `content_key`
   - Generates an ephemeral X25519 keypair
   - Derives a key-encryption key via `HKDF(ECDH(eph_sk, bob_device_pk))`
   - Wraps `content_key` under the KEK
   - Signs the envelope with Alice's Bitcoin wallet (BIP-322 over the envelope id)
5. The `.lock` envelope is a JSON object. Alice copies the link, pastes it in Signal/email/whatever, and sends it.

### Bob receives

1. Bob clicks the link.
2. The app loads the envelope. It recomputes the envelope id and verifies Alice's signature against her Bitcoin address.
3. The app finds Bob's `device_id` in the `recipients[]` array and reads his device secret from IndexedDB.
4. It derives the shared secret, unwraps `content_key`, decrypts the payload.
5. Message shown. Total on-screen time: < 3 seconds.

No Bitcoin transaction was made. The chain proved only that Bob controls his address and that Alice controls hers. Everything else is ordinary crypto.

## Flow 2 — Alice sells Bob a file (payment mode)

Sometimes you want Bitcoin to do more than identity: you want "10k sats gets you this." Payment mode is how.

### Setup

Alice runs (or trusts) a **relay**: a minimal web service that holds content keys on behalf of vaults and releases them upon observing confirmed Bitcoin payments. The relay has a long-lived X25519 device key. Its URL and device key are public.

### Alice creates a payment-gated vault

1. Alice chooses "payment-gated" in the app.
2. She sets: amount = 10,000 sats, payment address = her `bc1qalice...`, relay = `https://oc-lock.example/relay`, confirmations = 1.
3. The app encrypts the file with a fresh `content_key`.
4. It wraps `content_key` for the **relay's** device key (not Bob's — Bob hasn't been chosen yet).
5. It signs the envelope with Alice's Bitcoin wallet.
6. Alice shares the link.

Anyone with the link can see: sender, amount, payment address, relay. They cannot decrypt.

### Bob unlocks

1. Bob clicks the link. The app shows the price and the relay URL clearly.
2. Bob pays 10k sats from his wallet to `bc1qalice...`. (The app shows a QR code and a mempool.space link.)
3. Bob authenticates to the relay with OrangeCheck sign-in (BIP-322 challenge-response, same wallet).
4. The app submits `{ envelope_id, tx_id }` to the relay.
5. Relay checks: tx confirmed? right amount? right recipient? Then it unwraps `content_key` from its own device key, re-wraps it for Bob's device key (fetched from Nostr), and returns the new `recipients[]` entry.
6. Bob's app decrypts normally.

The relay is a trust anchor. It can refuse to release, refuse to verify, or collude with Alice. That's why its URL is always visible, why anyone can run one, and why future versions may replace it with DLC oracles.

## Flow 3 — Multi-device and rotation

Bob has a laptop and a phone. Each browser has its own device key. On first sign-in, each generates a new keypair and publishes a separate Nostr record with its own `device_id`. Senders fetching Bob's records get a list; they encrypt once per active device.

To rotate: Bob's browser generates a new `device_sk`, signs a new binding statement, publishes a replacement event. Old envelopes addressed to the old `device_pk` are unreadable from the new device (the old secret is gone). Senders fetching Bob's record after rotation get only the new key.

To abandon a device (laptop stolen): Bob publishes a revocation event from any of his other devices. Conforming senders refuse to encrypt to revoked records.

## Flow 4 — Self-vault (password manager pattern)

Alice can seal a vault to herself. Sender and recipient are both her Bitcoin address. The envelope's only `recipients[]` entry is her own device record. She can decrypt from any of her devices. This is the OC Lock equivalent of a password manager's master record, with no master password — the "password" is her Bitcoin wallet.

## What's different from LOCK v1.1

| Concern | LOCK v1.1 | OC Lock v2 |
|---|---|---|
| Sealing a vault | Requires on-chain binding TX | Purely local |
| Unlocking a vault | Requires on-chain unlock TX with exact amount | Local decrypt (identity mode) or one payment TX (payment mode) |
| Recipient onboarding | Must publish BIP-322 sig before receiving | Must publish device record once; reusable forever |
| Wallet requirements | Must support PSBT export/import | Must support BIP-322 `signMessage` (all major wallets do) |
| Encryption primitive | Embedded secret + "simplified" adaptor sig (broken) | X25519 ECDH + AES-256-GCM (standard, audited) |
| Recovery | Rebinding TX required | Re-run device setup from any browser |
| Metadata | Encrypted via ECDH w/ recipient pubkey | Same concept; device key is the pubkey |
| Fees | User pays for every seal and every unlock | Zero fees in identity mode; one fee per unlock in payment mode |

## What's still in common

Both protocols share the core insight: **Bitcoin addresses are excellent identities.** A Bitcoin address is a hash of a public key bound to real-world stake (if you want sybil resistance, see OrangeCheck). Using Bitcoin as the identity layer for encryption is the right architectural move. v1 tried to make the chain do double duty as both identity and access oracle. v2 lets the chain be what it's good at.

## What's layered from OrangeCheck

OC Lock depends on OrangeCheck in two places:

1. **Sybil-gated recipient inbox** (optional). A sender can require that their recipient hold an OrangeCheck attestation meeting thresholds ("only bonded recipients with 100k sats / 30 days"). Implemented by calling `@orangecheck/sdk#check` on the recipient's address before encrypting.
2. **Sign-in for the relay and the web app**. OC Lock's web client uses OrangeCheck's sign-in-with-bitcoin flow verbatim: a BIP-322 challenge, a signed response, a JWT session. The same wallet that signs binding statements signs the relay auth challenge. No second identity system.

Every OC Lock device record is also a valid OrangeCheck-adjacent artifact: it contains a BIP-322 signature over a canonical message that binds a Bitcoin address to key material. Attestation ids (SHA-256 of canonical message) can be computed over the binding statement, giving each device record a stable, verifiable identifier.

## Anti-patterns we rejected

- **Browser-wallet ECDH.** Bitcoin wallets don't expose ECDH. Nostr wallets do (NIP-04/44), but we don't want to require users to have a Nostr-native wallet. The device-key pattern sidesteps this cleanly.
- **Deriving decryption keys from BIP-322 signatures.** Some Bitcoin signing schemes are deterministic (Schnorr BIP-340, ECDSA with RFC 6979), so a fixed-message signature could in principle seed a KDF. But wallet implementations vary, and a single non-deterministic wallet silently corrupts everyone's keys. We don't rely on it.
- **Full Signal-protocol double ratchet.** Overkill for the primary use case (file drops, one-shot messages). Device-key rotation is coarser but adequate.
- **Server-mandatory storage.** The web client optionally caches vault metadata for discovery, but every envelope is self-contained. A user can export their vault to a QR code, paper, USB, or IPFS and unseal anywhere.

## Where to go next

- Read [SPEC.md](./SPEC.md) for normative encoding rules.
- Read [WHY.md](./WHY.md) for the v1 postmortem.
- See [`packages/core`](./packages/core) for the reference TypeScript implementation.
- Try the web client: [`orangecheck/oc-lock-web`](https://github.com/orangecheck/oc-lock-web).
