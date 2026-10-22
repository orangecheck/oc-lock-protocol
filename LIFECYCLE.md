# Lifecycle of OC Lock device records and envelopes

> **Normative companion to [`SPEC.md`](./SPEC.md) §3.5 (rotation and revocation) and `SECURITY.md`.** This document specifies what publishers and recipients MAY do to a device record or sealed envelope after publication, and what senders / verifiers MUST do in response. It introduces no new envelope kinds, tags, or fields. It pins down the lifecycle stance the spec already establishes and the rest of the OrangeCheck family already shares.

## 0. The family stance

Every OrangeCheck artifact is a **signed envelope**. The signature is the truth; the Nostr event is a directory entry; the bytes already exist on relays and in caches the moment an envelope is published. *Delete* is therefore not a protocol primitive in any verb of the family. The vocabulary the family does define is:

| Verb | What it means |
|---|---|
| **replace** | Publish a new envelope under the same Nostr addressable coordinate. NIP-33 replacement applies. |
| **revoke** | Publish a *separate, signed* envelope that ends the legitimacy of a prior one. Per-verb whether this exists. |
| **withdraw** | Spend the Bitcoin UTXO(s) backing a bond. Visible to verifiers on the next live check. |
| **expire** | Reach `expires_at`. |
| **hide (out-of-protocol)** | A reference dashboard MAY filter the artifact out of its UI. No protocol effect. |
| **request relay deletion (out-of-protocol)** | Publish a NIP-09 kind-5 event. Best-effort; not normative. |

## 1. OC Lock lifecycle

OC Lock has two distinct artifact types with different lifecycles: the **device record** (kind 30078, addressable, long-lived directory entry) and the **sealed envelope** (the `.lock` payload, content-addressed, may travel any transport). Each is governed differently.

### 1.1 Device record (kind 30078, `d = oc-lock:device:<addr>[:<device_id>]`)

#### Rotation

`SPEC.md` §3.5 specifies rotation: bind a new device under a new `device_id`, then revoke the old `device_id`. Rotation is not a replacement. Each device publishes under the Nostr key derived from its own secret (`SPEC.md` §3.4), so the new record sits at a different NIP-33 coordinate from the old one, and no relay replaces either. Until the old `device_id` is revoked, senders seal to both.

#### Revocation (explicit, in-spec)

`SPEC.md` §3.5 specifies revocation: a kind-30078 event with `device_pk` set to the literal string `"revoked"`, whose `content` is the revocation statement and whose `binding_sig` is the address's BIP-322 signature over it. Any Nostr key may carry it. **A revocation whose signature verifies, seen on any relay, retires every bind of its `(address, device_id)` whose signed `created_at` is not later than its signed `revoked_at`, whichever Nostr key carried either record. Conforming senders MUST seal only to binds that no such revocation retires.**

NIP-33 replacement cannot do this job. It replaces a record only at the same `(pubkey, kind, d)`. A revocation from another device, or from the wallet under a fresh key, has a different `pubkey` from the lost device's record, so it replaces nothing. A relay that never received the revocation keeps serving the bind whichever key carried it. The rule above depends on neither. Four edge cases:

1. **Order.** Revocations and binds are ordered by their signed timestamps, never by `event.created_at` and never by which record a relay kept. A bind signed after the latest revocation of its device is live. A bind signed at the same instant is retired. A bind dated later than the reader's clock plus a skew allowance is not live until the clock reaches it, and a revoker dates its revocation no earlier than the latest `created_at` among that device's binds it holds, so such a bind is retired too (`SPEC.md` §3.5).
2. **Recovery after revocation.** To recover, the recipient SHOULD bind a new `device_id` (per §3.6 multi-device pattern). A bind of the revoked `device_id` signed after the revocation is live again under case 1. A new `device_id` keeps the two keys apart in every reader's history. A revocation dated in the future retires every bind of its `device_id` dated before its `revoked_at`, a new one included, so it blocks that `device_id` until its date. The remedy is a new `device_id`.
3. **Already-sealed envelopes.** Revocation does not unseal envelopes that were *already addressed to the device record*. Those envelopes were encrypted with a content-key wrapped to the (now-revoked) `device_pk`; the holder of the matching `device_sk` can still decrypt them. This is unavoidable and not a spec defect — sealed bytes sent in the past cannot be cryptographically retracted. To prevent decryption, the recipient must destroy the `device_sk`, not revoke its public counterpart.
4. **Per device.** A revocation names one `device_id`, and it retires binds of that `device_id` for its own address only. Other devices of the same address stay live. The `d` form (`SPEC.md` §3.3 or §3.6) that files either record makes no difference.

#### Out-of-protocol controls

A recipient MAY hide a device record from a reference dashboard or publish a NIP-09 deletion request. Neither affects sender behavior: senders MUST apply every verified revocation they receive (`SPEC.md` §3.5), whether or not the recipient's dashboard shows the record.

### 1.2 Sealed envelope (`.lock`, `application/vnd.oc-lock+json`)

#### Replacement

Sealed envelopes are content-addressed by `id` (SHA-256 of the canonical envelope without `id` and without `sig`). Editing any byte produces a different `id` and a different envelope. Replacement is structurally impossible — a "new version" is just a different envelope.

#### Revocation

This spec does **not** define an envelope-revocation primitive. Once a sealed envelope has been delivered (any transport), the recipient holds the bytes and can decrypt them with their `device_sk`. The sender cannot retract the ciphertext. Three reasons revocation is omitted:

- The envelope is encrypted, not published. Most sealed envelopes never touch Nostr.
- For the envelopes that *are* published (e.g., as a delivery transport), revoking the directory entry would not retract the ciphertext from any party that already retrieved it.
- The right primitive for "I want to limit how long a recipient can act on this" is `expires_at` — see below.

#### Expiry

Sealed envelopes carry `expires_at` (`SPEC.md` §4.1 envelope schema). Conforming consumers (e.g., agents acting on a delegated payment intent) MUST refuse to act on an envelope where `expires_at` is in the past. This is the only protocol-level "withdraw the authority" mechanism available to senders. Choose `expires_at` accordingly at sign time.

#### Withdrawal of payment authority

For `payment`-kind envelopes, the sender's authorization to pay is bounded by whatever wallet logic governs the underlying spend. The protocol does not encode a payment-revocation primitive; senders SHOULD use short `expires_at` values for time-bounded payment intents and rely on wallet-level controls (multisig policy, transaction queueing) for stronger withdrawal guarantees.

#### Out-of-protocol controls

Hide and NIP-09 deletion-request are particularly meaningless for sealed envelopes, which generally do not live on Nostr at all. The reference dashboard's hide control applies only to the directory listing of envelopes that *were* published; it does not retract the ciphertext from any recipient.

## 2. Compliance summary

| Implementation MUST | Implementation MUST NOT |
|---|---|
| Seal only to live binds: apply every revocation whose BIP-322 signature verifies for its address, from any relay and carried by any Nostr key, to the binds of its `device_id` signed no later than its `revoked_at` (`SPEC.md` §3.5). | Define or honor any envelope-revocation primitive beyond `device_pk == "revoked"` at the device-record layer. |
| Honor per-device revocation: a revocation retires binds of its own `(address, device_id)` only, not the address's other devices. | Treat dashboard-local hide flags or NIP-09 deletion-request events as a substitute for `device_pk == "revoked"`. |
| Refuse to act on a sealed envelope whose `expires_at` is past. | Pretend that revoking a device record retroactively unseals envelopes already addressed to it — those envelopes are still decipherable by anyone holding the matching `device_sk`. |
| Order device records by their signed `created_at` and `revoked_at`. | Let a revocation without a valid BIP-322 signature retire a bind, or let `event.created_at` or relay replacement decide which bind is live. |
| Treat a bind dated later than the reader's clock plus a skew allowance as not live yet, and date a revocation no earlier than the latest `created_at` among that device's binds (`SPEC.md` §3.5). | Seal to a bind before its signed `created_at`, or report a device revoked before reading its records again. |
