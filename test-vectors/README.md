# OC Lock test vectors

Fixed inputs, fixed intermediate byte strings, fixed outputs. Any conforming OC Lock v2 implementation MUST produce byte-identical results for these vectors. If you're implementing OC Lock in a new language, these are the ground truth.

## Structure

Each envelope vector (`v01`–`v04`) is an independent `.json` file:

```json
{
    "description": "what this vector exercises",
    "inputs": {
        "plaintext": "<utf8 string>",
        "recipients": [
            {
                "address": "...",
                "device_id": "...",
                "device_pk": "<hex>",
                "device_sk": "<hex, provided for decrypt-side checks>"
            }
        ],
        "expected_sig_value": "<base64, a placeholder, not a real BIP-322 signature>"
    },
    "expected": {
        "envelope": { "id": "<64-char hex>", "...": "..." }
    }
}
```

## Conformance

Given a vector, a compliant implementation MUST:

1. Open `expected.envelope` with each recipient's `device_sk` (§4.3 steps 3–7) and recover `inputs.plaintext`. The AAD is §5's draft hash, final LF included.
2. Compute `id` as the SHA-256 of the canonical envelope (§5) with `id` and `sig.value` set to `""`, final LF included, and get `expected.envelope.id`.
3. Find `sig.value` equal to `inputs.expected_sig_value`. It is not a signature, so these vectors check no sender signature (§4.3 step 2).

If any of these diverge, the implementation is non-conformant. Typical bugs:

- Not sorting `recipients[]` by `device_id` ascending in the canonical form.
- Hashing the canonical JSON without its final LF, or removing `id` and `sig` instead of setting them to `""`.
- Emitting `"expires_at": undefined` rather than `"expires_at": null`.
- Using sloppy JSON encoding (spaces, numeric suffixes, object key ordering).

## Test harness

The `@orangecheck/lock-core` suite in `oc-packages/lock-core/` loads this directory, opens each envelope for each recipient, and checks each `id` as in step 2. New implementations should add a similar test.

## Current vectors

| File | Exercises |
|---|---|
| `v01-minimal.json` | Single recipient, no hint, no expiry, identity mode |
| `v02-multi-recipient.json` | Three recipients, tests `device_id` ordering |
| `v03-with-expiry.json` | `expires_at` present |
| `v04-with-hint.json` | `hint` field |

## Device-binding vectors

`device-binding/` holds the device record (§3), not an envelope, so the envelope harness above does not read it.

| File | Exercises |
|---|---|
| `device-binding/b01-bind-v3.json` | A v3 bind statement (§3.2), the Nostr key derived from the device secret (§3.4), the BIP-322 `binding_sig`, and the kind-30078 event id (§3.3) |
| `device-binding/r01-revoke-k2.json` | A revocation of the `b01` device (§3.5) carried by another Nostr key, a later re-bind, and a revocation whose `binding_sig` is over other bytes, with the binds left live in each case |
| `device-binding/r02-bind-ahead.json` | A bind of the `b01` device dated 2099 (§3.5 rule 4), a revocation dated at its own date and one dated 2026-10-21, with the live and pending binds at six reader times |
| `device-binding/a01-v2-sunset.json` | A v2 bind (§3.2), the same record carried by another Nostr key, the device's v3 re-bind (§3.4), and a revocation of the device with a re-bind that keeps `created_at` and one that does not, with the live binds and the authorized inbox keys in seven combinations, just before and at the v2 sunset |
| `device-binding/r03-revocation-read-from-statement.json` | The `r01` revocation under odd tags, and an undated revocation of the `b01` device (§3.5), with the binds left live in five combinations |
| `device-binding/s01-signed-without-final-lf.json` | The `b01` bind and the `r01` revocation with a `binding_sig` over their statements without the final LF (§3.3), and five records signed over other texts, with the binds left live in eight combinations |
| `device-binding/s02-content-without-final-lf.json` | The `b01` bind and the `r01` revocation written as the bytes their `binding_sig` covers, the statement without its final LF (§3.3), the same records signed over the statement with it, and the `b01` bind under content with a second LF, with the binds left live in seven combinations |
| `device-binding/s03-bip137-binding-sig.json` | The `b01` bind and the `r01` revocation with a legacy BIP-137 `binding_sig` (§3.3), over the statement and over it without its final LF, a bind whose BIP-137 signature has a high S, two BIP-137 signatures that do not verify, and the `b01` bind's BIP-322 simple signature with a high S, with the binds left live in eight combinations |

For `b01`, given `inputs`, a compliant implementation MUST derive `device_pk` and `nostr_pk`, build `statement` byte for byte (every line LF-terminated, the last one too), compute `event_id`, and verify `binding_sig` over `statement` for `address`. It MUST reject the same `content`, tags and `binding_sig` under `reject.other_pubkey`.

For `r01`, a compliant implementation MUST build the revocation statement and the re-bind statement byte for byte, derive `carrier_pubkey` from `carrier_nostr_sk` and the re-bind's keys from `rebind_device_sk`, compute each `event_id`, and verify each `binding_sig`. It MUST find that the `reject.revocation_bad_sig` signature does not verify over the statement. Given each set of records under `expected.live.cases`, it MUST leave live exactly the binds that case lists. The first case is the one replacement cannot settle: the revocation and the `b01` bind have different `pubkey`s, so no relay replaces one with the other.

For `r02`, a compliant implementation MUST build the three statements byte for byte, derive the keys from `ahead_device_sk`, `carrier_nostr_sk` and `carrier_now_nostr_sk`, compute each `event_id`, and verify each `binding_sig`. Given each case's records, judged at its `verified_at` with `max_skew_seconds`, it MUST leave live exactly the binds the case lists as `live`, and hold back exactly those it lists as `pending`.

For `a01`, a compliant implementation MUST derive `device_pk` and `nostr_pk` from `device_sk`, `copier_pubkey` from `copier_nostr_sk` and `carrier_pubkey` from `carrier_nostr_sk`, build every statement byte for byte, compute each `event_id`, and verify each `binding_sig`. The `v3_rebind_later` record is what a re-bind that drops the original `created_at` would publish: §3.4 forbids it, and its case shows why. Given each case's records, judged at its `reader_time`, it MUST leave live exactly the binds the case lists as `live` and authorize exactly the records it lists as `authorized`, each at its `pubkey`.

For `r03`, a compliant implementation MUST compute each `event_id` and verify each `binding_sig` over its `statement` for `address`. It MUST read each revocation as one of `(address, device_id)` from its statement, whatever its tags. Given each case's records, judged at `reader_time`, it MUST leave live exactly the binds the case lists. The undated revocation retires the `r01` re-bind too, though the re-bind is signed later than every dated revocation here.

For `s01`, a compliant implementation MUST compute each `event_id` and verify each `binding_sig` over its `signed` text for `address`. Every record's `content` is its statement with the final LF. It MUST accept a record whose `binding_sig` covers the statement without that LF, and discard each `reject` record, whose `binding_sig` covers another text. Given each case's records, judged at `reader_time`, it MUST leave live exactly the binds the case lists. `generate-s01.mjs` rebuilds `s01` byte for byte.

For `s02`, a compliant implementation MUST compute each `event_id` and verify each `binding_sig` over its `signed` text for `address`. Every `expected` record's `content` other than `b01`'s and `r01`'s is its statement without the final LF, and its `binding_sig` covers that content: it MUST accept each. It MUST discard each `reject` record: two whose `binding_sig` covers their content with a final LF added, and `bind_content_second_lf`, whose content is the statement with a second LF and whose `binding_sig` is `b01`'s, over the statement. A reader tries the content without its final LF only when the content ends in exactly one LF. Given each case's records, judged at `reader_time`, it MUST leave live exactly the binds the case lists. `generate-s02.mjs` rebuilds `s02` byte for byte.

For `s03`, a compliant implementation MUST compute each `event_id` and verify each `binding_sig` over its `signed` text for `address`. Every `binding_sig` but `reject.bind_bip322_high_s`'s is 65 bytes, a legacy BIP-137 signature, which it MUST check as OC Attest SPEC §4 does, ignoring the header's address type and accepting a high S. It MUST accept each `expected` record and discard each `reject` record, `bind_bip322_high_s` among them: its BIP-322 simple signature has a high S, which §4 refuses. Given each case's records, judged at `reader_time`, it MUST leave live exactly the binds the case lists. `generate-s03.mjs` rebuilds `s03` byte for byte.

The Bitcoin key is BIP-322's own published test vector key: public, and never for real use. An event signature is not given, because BIP-340 signing takes fresh randomness; check the id and verify any signature you make.
