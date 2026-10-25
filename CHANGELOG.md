# Changelog

All notable changes to the OC Lock protocol and reference SDK.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

**No envelope, statement or canonicalization change.**

- **`SPEC.md` §7.5.** A verifier of an envelope sealed by an OC Agent under a
  `lock:seal` or `lock:chat` delegation takes each recipient from the
  envelope's `recipients[]`, never from the agent action's `scope_exercised`;
  a recipient checks `mime` and the byte limits against the plaintext.

## [2.4.0] — 2026-10-24 — a revocation is read from its signed statement

**Minor release. No envelope, statement or canonicalization change; publishers are unchanged.**

### Changed
- **`SPEC.md` §3.3, §3.5.** A reader takes a revocation's address and `device_id` from its signed statement. It MUST NOT reject a revocation whose `binding_sig` verifies because its `addr`, `device_id` or `device_pk` tag is missing or says something else, or because of its `d` tag. The §3.3 tag rules apply to binds, whose fields a reader uses. Publishers still write every §3.3 tag, with `["device_pk", "revoked"]`.
- **`SPEC.md` §3.5.** A revocation that verifies but signs no readable `revoked_at` retires every bind of its device, whatever that bind's `created_at`. A revocation signs no `created_at`, and `event.created_at` does not stand in, since whoever republishes the event sets it. A revoker MUST still sign `revoked_at`.
- **`SPEC.md` §10** says the same.

### Added
- **Test vector `device-binding/r03-revocation-read-from-statement.json`**: the `r01` revocation under two sets of odd tags (only `d` and `binding_sig`; another address's `d`, `addr` and `device_id` and a live-looking `device_pk`), and a revocation of the `b01` device that signs no `revoked_at`, with the binds left live in five combinations.

Reference implementation: `@orangecheck/lock-device` 0.7.0 (`parseDeviceEvent`, `liveDevices`).

## [2.3.0] — 2026-10-23 — v2 records stop naming an inbox

**Minor release. No envelope, statement or canonicalization change; sealing and decryption are unchanged.**

### Changed
- **`SPEC.md` §3.4.** From 2027-01-21T00:00:00Z by the verifier's clock, a v2 device record authorizes no Nostr key; only a v3 record's signed `nostr_pk` is a device's inbox. Before that instant the 2.2 rule applies. A v2 bind stays live for sealing to its `device_pk`, so a device whose binds are all v2 still receives envelopes, by link rather than at a Nostr inbox.
- **`SPEC.md` §3.4, re-binding.** A client holding a live v2 device's secret SHOULD publish a v3 statement for the same address, `device_id` and `device_pk`, under the key derived from the device secret. The re-bind MUST carry the v2 statement's `created_at`, so a revocation of the device retires it too. It replaces the v2 record at relays that hold both. A client SHOULD offer it for its own v2 devices and say when v2 stops naming an inbox.
- **`SPEC.md` §10** gains the inbox and re-bind row.

### Added
- **Test vector `device-binding/a01-v2-sunset.json`**: a v2 bind of a device, the same record carried by another key, the device's v3 re-bind, and a revocation of the device with a re-bind that keeps `created_at` and one that does not, with the live and authorized records in seven combinations at reader times just before and at the sunset.

### Fixed
- **`PROTOCOL.md`** Flow 1 shows the v3 binding statement, with its `nostr_pk` line, that SPEC §3.2 requires publishers to emit, and says the device record is signed by that key.

Reference implementation: `@orangecheck/lock-device` 0.6.0 (`authorizedDevices(records, { now })`, `V2_INBOX_SUNSET`).

## [2.2.1] — 2026-10-22 — which key carries a revocation

**Errata. Wording only: no envelope, statement, reader rule or test vector change.**

### Changed
- **`SPEC.md` §3.5.** A revocation MUST use the §3.3 `d` tag. A device revoking itself SHOULD carry it under its own Nostr key, so that every relay that accepts it stops serving that device's bind, and MAY use a fresh key. A revocation of another device SHOULD be carried by a fresh key. A key that carries another live bind of the address MUST NOT carry a revocation, because relays replace a record by `(pubkey, kind, d)`. Readers accept a revocation under any key, as before.
- **`SPEC.md` §3.6.** New records SHOULD use the §3.3 `d` form: each device publishes under its own key, so the address form already holds one record per device. The per-device form remains valid for readers, but a `#d` query for the address does not return it.
- **`LIFECYCLE.md`** §1.1 and the §2 compliance rows, the **§10** checklist, and **`PROTOCOL.md`** Flow 3 follow.

lock.ochk.io and chat.ochk.io already publish this way.

## [2.2.0] — 2026-10-22 — the reader's clock, and dating a revocation

**Minor release. No envelope, binding-statement or canonicalization change.**

### Changed
- **`SPEC.md` §3.5 rule 4.** A bind whose signed `created_at` is later than the reader's clock plus a skew allowance (10 minutes RECOMMENDED) is not live yet. A reader SHOULD still list it, so that it can be revoked.
- **`SPEC.md` §3.5, dating a revocation.** A revoker signs `revoked_at` no earlier than its own clock and no earlier than the latest signed `created_at` among the binds of that device it holds. A client SHOULD read the device's records again before it reports the device as revoked.
- **`LIFECYCLE.md` §1.1** edge case 1 and the §2 MUST rows, and the **§10** checklist, follow. Edge case 2 states that a revocation dated in the future blocks its `device_id` until that date, and that the remedy is a new `device_id`.

### Added
- **Test vector `device-binding/r02-bind-ahead.json`**: a bind of the `b01` device dated 2099-01-01, a revocation of it dated at that bind's own date, and one dated 2026-10-21, with the live and pending binds at six reader times. The bind with the first revocation ends with nothing live; with the second it is pending until 2099 and live after.

Reference implementation: `@orangecheck/lock-device` 0.5.0 (`liveDevices` with the reader's clock, `pendingDevices`, `revokedAtFor`).

## [2.1.0] — 2026-10-21 — a revocation signed by the address

**Minor release. No envelope, binding-statement or canonicalization change.** It also releases the changes listed below it, made between 2.0.0 and this date.

**The 2.0 text could not deliver what Flow 3 promised.** Flow 3 says that when Bob's laptop is stolen, he revokes it from another device and senders stop sealing to it. §3.5 and LIFECYCLE §1.1 made a revocation work by NIP-33 replacement: the newest record at the same coordinate wins. NIP-33 keys that coordinate by `(pubkey, kind, d)`, and each device publishes under its own Nostr key (§3.4). So a revocation from Bob's phone sat beside the laptop's record and replaced nothing. Only the laptop's own key could have replaced it, and Bob no longer had the laptop. A relay that never received a revocation also kept serving the bind. Rotation had the same gap: the new record did not replace the old one. And §3.5 never gave the revocation statement's bytes.

### Changed
- **`SPEC.md` §3.5** gives the revocation statement byte for byte (`oc-lock:device-revoke:v2` with `address`, `device_id` and `revoked_at`) and the rule for which binds are live. A revocation whose `binding_sig` verifies for its address retires every bind of its `(address, device_id)` whose signed `created_at` is not later than its signed `revoked_at`. That holds whichever Nostr key carried either record and whichever relay served it. A bind signed later stays live; a bind signed at the same instant is retired. A revocation without a valid signature retires nothing. Rotation is a new device plus a revocation of the old one.
- **`LIFECYCLE.md` §1.1** states the same rule. Edge cases 1, 2 and 4 order records by signed time instead of NIP-33 replacement, and the §2 MUST rows say so.
- **`PROTOCOL.md` Flow 3**: Bob revokes the stolen laptop with his wallet, from any client, without the laptop's key. Rotation revokes the old device.
- **`SPEC.md` §3.6, §6 `E_REVOKED`, §10** and **`SECURITY.md`** item 5 refer to live binds.

### Added
- **Test vector `device-binding/r01-revoke-k2.json`**: the `b01` device revoked by its address under another Nostr key. The revocation retires the `b01` bind, which it cannot replace at any relay. A bind of the same `device_id` signed after it is live, and the same revocation with a signature over other bytes retires nothing. Under the 2.0 rule, the first case left `b01` live.

Reference implementation: `@orangecheck/lock-device` 0.4.0 `liveDevices`, which lock.ochk.io and chat.ochk.io use.

## Between 2.0.0 and 2.1.0 — 2026-09

### Fixed — 2026-10-21

- **Reference relay set** (§3.3): names the relays the reference app now uses. `relay.snort.social` and `offchain.pub` left it on 2026-10-21: snort kept none of the family events it accepted, and offchain refused events signed by fresh keys. `relay.damus.io` and `nostr.oxtr.dev` joined. Non-normative; nothing a client MUST do changes.

### Added — 2026-10-20

- **Test vector `device-binding/b01-bind-v3.json`**: a v3 bind statement, its derived Nostr key, its BIP-322 signature and its kind-30078 event id, with the rule that the same record under another `event.pubkey` is rejected. Implementations had no fixed bytes to check a binding against.

### Fixed — 2026-10-08

- **Reference relay set** (§3.3): names the five relays the reference app actually uses. It listed `relay.damus.io`, which the shared default set has never included. Non-normative; nothing a client MUST do changes.

### Clarified
- **§4.3 step 2**: `sig.pubkey` MUST equal `from.address`. §7.1 states authenticity in terms of `from.address` while verification runs against `sig.pubkey`; the two are now required to be the same address. An envelope opened without sender verification (including any with an empty `sig.value`) MUST NOT present `from.address` as authenticated. Reference implementation: `@orangecheck/lock-core` 1.2.0 (`UnsealResult.authenticated`).
- **§3.3**: a device record is used only for the address its binding statement signs, and only under that address's `d` tag (or the §3.6 per-device form). Reference implementation: `@orangecheck/lock-device` 0.2.2.

### Added
- **§3.2 v3 bind statement** (`oc-lock:device-bind:v3`) adds a `nostr_pk:` line so a device record commits to the Nostr pubkey that publishes it. Verifiers reject a v3 record whose `event.pubkey` differs from the signed `nostr_pk`. Publishers MUST emit v3; v2 records remain valid for sealing.
- **§3.4 Authorizing a Nostr pubkey** — the rule for deriving signing-key authorization from a device record: v3 authorizes its signed `nostr_pk`; a v2 record authorizes its `event.pubkey` only while it is the sole pubkey carrying that `(address, device_id)` and no v3 record exists for it. Reference implementation: `@orangecheck/lock-device` 0.3.0 `authorizedDevices`.

## Between 2.0.0 and 2.1.0 — 2026-06

### Added
- **§4.5 Chat and re-wrap mode** and **§4.6 Seal mode** — OC Chat is a mode of OC Lock. Two new envelope `kind` values (`"chat"`, `"chat-seal"`) and the normative **recipient-exclusion rule**: for chat kinds, `recipients[]` is excluded from both the AEAD AAD and the signed `id`, making an envelope re-keyable (a payment relay or seal beacon can re-wrap for a new recipient without breaking the `id`, the BIP-322 signature, or the ciphertext tag). The `"chat-seal"` `seal` object carries a block-height timelock released by a **named** beacon — beacon-enforced policy, not consensus; the `cltv` anchor is the reserved consensus-enforced upgrade path. Full detail in [`oc-chat-protocol`](https://github.com/orangecheck/oc-chat-protocol).
- §6 error codes `E_BLOCK_UNMET`, `E_BEACON_UNAVAILABLE`, `E_NO_POSTAGE`, `E_BAD_POSTAGE`, `E_THREAD_GAP`.
- §11 IANA: OC Chat claims Nostr kinds **30110–30112** (`oc-lock-chat-*` d-tags); DMs transport over NIP-59 gift-wrap.

## Between 2.0.0 and 2.1.0 — 2026-04

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
