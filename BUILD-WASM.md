# Building `@ochk/lock-adaptor-wasm`

This guide defines the reproducible build for the Rust → WASM crypto engine used by LOCK v1 Taproot adaptor protocol.

## Prerequisites
- Rust stable + `wasm32-unknown-unknown` target
- `wasm-bindgen-cli` or `wasm-pack`
- `secp256k1-zkp` (or equivalent) with Schnorr + adaptor primitives

## Layout (proposed)
```
packages/
  lock-adaptor-wasm/
    Cargo.toml
    src/lib.rs
    build.rs (optional)
    pkg/ (output)
```

## Cargo.toml (sketch)
```
[package]
name = "lock-adaptor-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
secp256k1 = { version = "0.28", features = ["rand"] }
secp256k1-zkp = "0.8"           # provides extra primitives
rand = "0.8"
getrandom = { version = "0.2", features = ["js"] }
wasm-bindgen = "0.2"
zeroize = "1"

[features]
default = []

```

## lib.rs (outline)
- Expose `init`, `schnorr_sign/verify`, `tagged_hash`
- Expose `adaptor_commit`, `adaptor_verify_commit`, `adaptor_extract`
- Ensure x-only pubkeys; use BIP-340 tagged hashing; constant-time ops
- Zeroize secret buffers on drop

## Build
- Using wasm-pack:
```
wasm-pack build packages/lock-adaptor-wasm --target web --release
```
- Outputs JS glue + `.wasm` under `pkg/`

## Consumption in Next.js
- Add dependency to workspace via `file:packages/lock-adaptor-wasm/pkg`
- Dynamic import in app code:
```ts
const wasm = await import('@ochk/lock-adaptor-wasm');
await wasm.default(); // or explicit init if needed
```
- Next 15 Turbopack supports WebAssembly; ensure config enables wasm modules if required.

## Reproducibility
- Pin Rust toolchain via `rust-toolchain.toml`
- Pin crate versions
- Record `git commit` of zkp dependency

## Security Checklist
- Run `cargo audit`
- Enable `panic = abort`
- Fuzz `adaptor_extract` inputs
- Unit tests for all exported functions

## CI
- Build WASM for web target
- Publish `pkg/` as an artifact
- Run JS e2e tests against the built module

