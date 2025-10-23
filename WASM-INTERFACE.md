# LOCK v1 Taproot Adaptor — WASM Interface

This document defines the minimal WebAssembly interface we will expose from an audited Rust build (secp256k1-zkp) for the Taproot adaptor-locked protocol.

## Goals
- Only constant-time, memory-safe crypto in WASM
- TS/Next code orchestrates PSBTs and AEAD; NO custom curve math in JS
- Stable FFI surface with versioning and zeroization discipline

## Module: `@ochk/lock-adaptor-wasm`

### Initialization
- `async init(moduleOrPath: WebAssembly.Module | string): Promise<void>`
  - Loads and instantiates the WASM; must be called before any function

### Types
- `type Bytes32 = Uint8Array & { length: 32 }`
- `type Bytes64 = Uint8Array & { length: 64 }`
- `type Opaque = Uint8Array` (opaque commitment/template payload)

### Functions
1) Schnorr (BIP-340)
- `schnorr_sign(msg32: Bytes32, seckey32: Bytes32, auxRand32?: Bytes32): Bytes64`
- `schnorr_verify(msg32: Bytes32, pubkey32: Bytes32, sig64: Bytes64): boolean`
- `xonly_pubkey_serialize(pubkey32: Bytes32): Bytes32` // ensure x-only form

2) Tagged Hash (BIP-340-style)
- `tagged_hash(tag: string, data: Uint8Array): Bytes32`

3) Adaptor Precommit/Extraction
- `adaptor_commit(
    msg32: Bytes32,
    tap_internal_pubkey32: Bytes32,
    tweak32: Bytes32,              // taproot tweak for key-path spend
    T_xonly32: Bytes32,            // commitment to k: T = k·G (x-only)
    bind_data: Uint8Array          // domain bind: vaultId || outputCommitment
  ): Opaque /* spendTemplate */`

- `adaptor_verify_commit(
    msg32: Bytes32,
    tap_internal_pubkey32: Bytes32,
    tweak32: Bytes32,
    T_xonly32: Bytes32,
    spendTemplate: Opaque
  ): boolean`

- `adaptor_extract(
    final_sig64: Bytes64,          // on-chain Schnorr sig from challenge spend
    spendTemplate: Opaque,
    T_xonly32: Bytes32
  ): Bytes32 /* scalar k */`

Notes:
- The exact internal representation of `spendTemplate` is opaque to JS; it carries values needed to check/relate final `s` and recover `k` safely.
- All secrets are zeroized after use inside WASM.

### Errors
- Every function throws with structured `{ code: string, message: string }` errors
- Representative codes:
  - `WASM_NOT_INITIALIZED`
  - `INVALID_LENGTH`
  - `ADAPTOR_EXTRACT_FAIL`
  - `VERIFY_FAIL`

### Versioning
- `get_version(): { crate: string; commit: string; semver: string }`
- Deny-load if major version mismatch with JS wrapper

### Security
- Constant-time scalar/point ops
- No secret data leaves WASM except derived `k` after successful extraction
- `zeroize` all secret buffers

### Test Vectors
- Provide deterministic vectors for:
  - schnorr sign/verify
  - adaptor_commit/verify/extract roundtrip
  - negative cases (wrong T, wrong msg32, wrong tweak)


