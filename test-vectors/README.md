# OC Lock test vectors

Fixed inputs, fixed intermediate byte strings, fixed outputs. Any conforming OC Lock v2 implementation MUST produce byte-identical results for these vectors. If you're implementing OC Lock in a new language, these are the ground truth.

## Structure

Each `.json` file in this directory is an independent vector:

```json
{
    "description": "what this vector exercises",
    "inputs": {
        "payload": "<utf8 string>",
        "sender": { "address": "...", "signature": "..." },
        "recipients": [
            {
                "address": "...",
                "device_id": "...",
                "device_pk": "<hex>",
                "device_sk": "<hex, provided for decrypt-side checks>",
                "eph_sk": "<hex, fixed so the KEM is deterministic>"
            }
        ],
        "nonce_ct": "<24-char hex>",
        "content_key": "<64-char hex>",
        "created_at": "<iso8601 utc>"
    },
    "expected": {
        "envelope": { "...": "..." },
        "canonical": "<exact canonical bytes, LF-terminated, as a string>",
        "id": "<64-char hex>"
    }
}
```

## Conformance

Given the `inputs`, a compliant implementation MUST:

1. Derive per-recipient KEKs and wrap `content_key` exactly as specified in §4.2.
2. Produce the same `envelope` object (shape + field values).
3. Serialize to the **byte-identical** `canonical` string.
4. Compute the same `id` (SHA-256 of canonical bytes with `sig.value` emptied).

If any of these diverge, the implementation is non-conformant. Typical bugs:

- Not sorting `recipients[]` by `device_id` ascending in the canonical form.
- Emitting `"expires_at": undefined` rather than `"expires_at": null`.
- Using sloppy JSON encoding (spaces, numeric suffixes, object key ordering).

## Test harness

The `@orangecheck/lock-core` suite in `oc-packages/lock-core/` loads this directory and asserts byte-equality per vector. New implementations should add a similar test.

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

For `b01`, given `inputs`, a compliant implementation MUST derive `device_pk` and `nostr_pk`, build `statement` byte for byte (every line LF-terminated, the last one too), compute `event_id`, and verify `binding_sig` over `statement` for `address`. It MUST reject the same `content`, tags and `binding_sig` under `reject.other_pubkey`.

For `r01`, a compliant implementation MUST build the revocation statement and the re-bind statement byte for byte, derive `carrier_pubkey` from `carrier_nostr_sk` and the re-bind's keys from `rebind_device_sk`, compute each `event_id`, and verify each `binding_sig`. It MUST find that the `reject.revocation_bad_sig` signature does not verify over the statement. Given each set of records under `expected.live.cases`, it MUST leave live exactly the binds that case lists. The first case is the one replacement cannot settle: the revocation and the `b01` bind have different `pubkey`s, so no relay replaces one with the other.

For `r02`, a compliant implementation MUST build the three statements byte for byte, derive the keys from `ahead_device_sk`, `carrier_nostr_sk` and `carrier_now_nostr_sk`, compute each `event_id`, and verify each `binding_sig`. Given each case's records, judged at its `verified_at` with `max_skew_seconds`, it MUST leave live exactly the binds the case lists as `live`, and hold back exactly those it lists as `pending`.

For `a01`, a compliant implementation MUST derive `device_pk` and `nostr_pk` from `device_sk`, `copier_pubkey` from `copier_nostr_sk` and `carrier_pubkey` from `carrier_nostr_sk`, build every statement byte for byte, compute each `event_id`, and verify each `binding_sig`. The `v3_rebind_later` record is what a re-bind that drops the original `created_at` would publish: §3.4 forbids it, and its case shows why. Given each case's records, judged at its `reader_time`, it MUST leave live exactly the binds the case lists as `live` and authorize exactly the records it lists as `authorized`, each at its `pubkey`.

The Bitcoin key is BIP-322's own published test vector key: public, and never for real use. An event signature is not given, because BIP-340 signing takes fresh randomness; check the id and verify any signature you make.
