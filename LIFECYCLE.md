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

#### Rotation (replacement)

`SPEC.md` §3.5 already specifies rotation: generate a new `(device_sk, device_pk)`, re-sign the binding statement, re-publish under the same `d` tag. NIP-33 replacement at conforming relays makes the new record canonical for that coordinate. The old record's bytes remain wherever they were already copied; senders consulting current relay state will encrypt to the new record. This LIFECYCLE document adds nothing to §3.5 beyond restating that rotation is a *replacement*, not a *deletion*.

#### Revocation (explicit, in-spec)

`SPEC.md` §3.5 already specifies revocation: re-publish the device record with `device_pk` set to the literal string `"revoked"` and a fresh `binding_sig` over a revocation statement. **Conforming senders MUST refuse to encrypt to a revoked device record.** This LIFECYCLE document restates that requirement and clarifies four edge cases:

1. **Race with rotation.** If a recipient observes both a rotation event and a revocation event for the same `d`, the recipient SHOULD treat the higher-`created_at` event as canonical. This is the same ordering NIP-33 already imposes and requires no additional logic.
2. **Recovery after revocation.** Revoking a device is one-way for that `d`. To recover, the recipient SHOULD publish a new device record under a *different* `device_id` (per §3.6 multi-device pattern). Re-using the revoked `d` with a non-`"revoked"` `device_pk` is permitted by NIP-33 but is a footgun — senders that cached the revocation MAY keep refusing to encrypt for some time.
3. **Already-sealed envelopes.** Revocation does not unseal envelopes that were *already addressed to the device record*. Those envelopes were encrypted with a content-key wrapped to the (now-revoked) `device_pk`; the holder of the matching `device_sk` can still decrypt them. This is unavoidable and not a spec defect — sealed bytes sent in the past cannot be cryptographically retracted. To prevent decryption, the recipient must destroy the `device_sk`, not revoke its public counterpart.
4. **Multi-device recipients.** A revocation under `d = oc-lock:device:<addr>:<device_id>` applies only to that specific device. Other devices for the same `<addr>` remain valid. Senders implementing multi-device per §3.6 MUST honor per-device revocation rather than per-address.

#### Out-of-protocol controls

A recipient MAY hide a device record from a reference dashboard or publish a NIP-09 deletion request. Neither affects sender behavior: senders MUST consult relay state for the canonical (`pubkey`, `kind`, `d`) record and MUST honor `device_pk == "revoked"` regardless of whether the recipient's dashboard shows the record.

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
| Refuse to encrypt to a device record whose canonical (highest-`created_at`) version has `device_pk == "revoked"` (`SPEC.md` §3.5). | Define or honor any envelope-revocation primitive beyond `device_pk == "revoked"` at the device-record layer. |
| Honor per-device revocation: a revocation under `d = oc-lock:device:<addr>:<device_id>` is bounded to that device, not the address. | Treat dashboard-local hide flags or NIP-09 deletion-request events as a substitute for `device_pk == "revoked"`. |
| Refuse to act on a sealed envelope whose `expires_at` is past. | Pretend that revoking a device record retroactively unseals envelopes already addressed to it — those envelopes are still decipherable by anyone holding the matching `device_sk`. |
