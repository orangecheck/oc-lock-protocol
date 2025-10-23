# WASM Security & Memory Hygiene

- All secret inputs are allocated in WASM memory and zeroized immediately after use.
- Use `zeroize` and `clear_on_drop` patterns.
- Build with `panic = abort` and strip symbols.
- Reject malformed lengths (strict 32/64-byte enforcement).
- Never return internal point/scalar representations beyond specified outputs.
- Fuzz `adaptor_extract` and `adaptor_verify_commit` heavily.
- Deny-load if version mismatch between JS wrapper and WASM module.
- Review using side-channel timing checks (ct comparisons for secrets).

