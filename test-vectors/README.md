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

Given `inputs`, a compliant implementation MUST derive `device_pk` and `nostr_pk`, build `statement` byte for byte (every line LF-terminated, the last one too), compute `event_id`, and verify `binding_sig` over `statement` for `address`. It MUST reject the same `content`, tags and `binding_sig` under `reject.other_pubkey`. The Bitcoin key is BIP-322's own published test vector key: public, and never for real use. An event signature is not given, because BIP-340 signing takes fresh randomness; check the id and verify any signature you make.
