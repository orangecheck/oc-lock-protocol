# Security Policy

## Reporting a vulnerability

Email **security@ochk.io** with:

- A clear description of the issue and the affected component.
- Reproduction steps (proof-of-concept preferred; minimal test vector is fine).
- Your assessment of impact: what can an attacker do, under what assumptions?
- Whether you want credit when we publish the fix.

We aim to acknowledge within 48 hours and publish a fix for high/critical issues within 14 days. Do not file public GitHub issues for suspected vulnerabilities.

## Scope

This document covers the **OC Lock v2 protocol specification** in this repository. The reference implementation lives in [`orangecheck/oc-packages`](https://github.com/orangecheck/oc-packages); the web client lives in [`orangecheck/oc-lock-web`](https://github.com/orangecheck/oc-lock-web). Each of those has its own `SECURITY.md`.

## Threat model

### What OC Lock protects

- **Confidentiality of the payload** against anyone who isn't the addressed recipient. Only holders of a `device_sk` listed in `recipients[]` can derive the content key.
- **Authenticity of the sender** against forgery. The BIP-322 signature in `sig.value` binds the envelope id to the sender's Bitcoin address. A forged envelope would require the sender's private key.
- **Binding between device pubkey and Bitcoin identity.** The `binding_sig` inside each device record proves the device_pk is authorized by the holder of the Bitcoin address. Implementations MUST verify this signature before encrypting (see §3.3 of [SPEC.md](./SPEC.md) and the compliance checklist in §9).
- **Tamper-evidence of envelope contents.** The envelope `id` is a cryptographic commitment to the canonical bytes; any modification invalidates the id and the sender signature.

### What OC Lock does not protect

- **Metadata privacy on the wire.** `from.address`, `recipients[*].address`, `hint`, `payment.address`, `created_at`, and `expires_at` are all plaintext. If the envelope leaves your device, observers learn who sent it, to whom, when, and any hint you chose to include. For metadata privacy, redact the addresses and use out-of-band delivery to known recipients.
- **Forward secrecy (per message).** Compromise of a device secret lets the attacker decrypt every past envelope addressed to that device. Device-key rotation gives *coarse* forward secrecy, but no per-message ratchet.
- **Post-quantum confidentiality.** X25519 and secp256k1 both break under a sufficiently large quantum computer. There is no PQ layer in v2.
- **Denial of service on Nostr.** A hostile relay set can refuse to publish or return your device record. You can self-host or publish to a wider relay set to mitigate.
- **Sender anonymity.** `from.address` is plaintext. If you want anonymity, sign from a fresh address — but you lose the identity binding.
- **Relay trust in payment mode.** Payment-gated vaults hand the content key to a named relay until a Bitcoin transaction is observed. A malicious relay can refuse to release, leak the wrapped key, or collude with the sender. Payment mode is opt-in and the relay URL is always visible.

### Assumptions the protocol makes

- **Bitcoin's security model holds.** ECDSA / Schnorr over secp256k1 remains unforgeable at current parameter sizes.
- **BIP-322 is implemented correctly** by both signing and verifying clients. Implementations should pin a verifier to a version known to handle all address types (P2WPKH, P2TR, P2WSH, P2PKH).
- **The recipient's browser (or runtime) isn't compromised.** Device secret keys live in untrusted territory by design; if the recipient's device is hostile, all bets are off.
- **Randomness is strong.** `crypto.getRandomValues` / CSPRNG is used for every nonce and ephemeral keypair. Weak randomness on a sender breaks confidentiality against passive observers.

## Normative compliance requirements

These are cryptographic correctness conditions that conforming implementations MUST satisfy:

1. **Verify `binding_sig` before using a device record.** Implementations MUST call a BIP-322 verifier on the `binding_statement` against the claimed `address` and refuse to encrypt when verification fails. Failure to do this lets a hostile relay substitute an attacker's `device_pk` for the real one.
2. **Verify `sig.value` before trusting envelope contents** (unless the caller explicitly skips — e.g., self-seals).
3. **Never reuse AEAD nonces with the same key.** `content_key` is fresh per envelope and `nonce_ct` is fresh random 12 bytes. Per-recipient `nonce_kek` is also fresh random.
4. **Zeroize intermediate key material.** `content_key`, `shared`, and `kek` MUST be wiped after use. (JS implementations are best-effort; V8 may retain copies.)
5. **Refuse revoked records.** Device records with `device_pk === "revoked"` MUST NOT be used for encryption.
6. **Enforce `expires_at`** on the receiving side.
7. **Use the canonical form** per [SPEC §5](./SPEC.md#5-canonicalization) for id computation and signature domains. Recipients MUST be sorted by `device_id` ascending.

## Known cryptographic caveats

- **Signature malleability.** BIP-322 signatures for Schnorr-based addresses are non-malleable. ECDSA signatures (legacy P2PKH) are technically malleable but the envelope id is bound into the signed message, so malleated re-issues would still need the sender's private key.
- **Nonce randomness relies on the platform.** Browsers and Node expose `crypto.getRandomValues` backed by the OS CSPRNG. If a sender's runtime is broken (e.g., a buggy embedded browser), ciphertexts may be predictable.
- **No side-channel guarantees.** JavaScript crypto libraries (including `@noble/*`) make best-effort constant-time operations, but a hostile host can time them anyway.

## Dependency posture

The reference implementation intentionally depends on a narrow set of audited libraries:

| Package | Purpose |
|---|---|
| `@noble/curves` | X25519, secp256k1 Schnorr |
| `@noble/hashes` | SHA-256, HKDF, PBKDF2 |
| `@noble/ciphers` | AES-256-GCM |

BIP-322 *verification* in the web client uses the `bip322-js` package, which transitively depends on the `elliptic` library. `elliptic` has known low-severity timing channels in ECDSA (npm advisory 1112030). Our use is verification-only and signatures are bound to BIP-322 message domain, so the risk is limited to signature-check timing; we accept this in the v2 baseline and plan to migrate to a `@noble`-based BIP-322 verifier when one is available.

## Report a protocol-level concern

If you believe a clause of the specification itself is unsound (as opposed to a bug in an implementation), email security@ochk.io with subject line prefix `[protocol]`. Protocol-level concerns may trigger a spec revision; we version the spec strictly (§9).
