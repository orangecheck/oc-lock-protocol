# LOCK Protocol v1.0 — Taproot Adaptor-Locked Secret

**Profile:** `lock-v1-taproot-adaptor`  
**Status:** Implementation-Ready Specification  
**Version:** 1.0.0

---

## Overview

LOCK (Ledger-Originated Cryptographic Key) Protocol v1.0 enables **cryptographically-enforced encryption** to a Bitcoin Taproot address, where decryption requires:

1. **On-chain proof of ownership:** Recipient spends a Challenge UTXO with their Taproot private key
2. **Proof-of-Access (PoA):** Recipient creates a transaction meeting specific rules (amount, confirmations, optional timelock)

**Key Innovation:** Uses **Taproot adaptor signatures** (scriptless scripts) to bind vault decryption to on-chain events, with complete **privacy** (all transactions appear as standard Taproot key-path spends).

---

## Core Properties

✅ **Cryptographically enforced:** Decryption is mathematically impossible without both Challenge spend and mined PoA  
✅ **One-time sender operation:** Sender creates vault once and never returns  
✅ **Wallet compatible:** Works with any Taproot PSBT signer (browser, hardware, air-gapped)  
✅ **Privacy-preserving:** No custom opcodes, covenant scripts, or on-chain fingerprints  
✅ **Deterministic:** Clear state machine, unambiguous algorithms, comprehensive test vectors

---

## How It Works

### Sender Flow (Seal)

1. **Generate adaptor secret `k`** and compute commitment `T = k·G`
2. **Fund Challenge UTXO** (330 sats to recipient's Taproot address)
3. **Create adaptor pre-signature** for Challenge spend
4. **Encrypt payload** with random master key
5. **Encrypt master key** with temporary key derived from `k`
6. **Assemble vault file** (JSON) with all metadata and ciphertext
7. **Erase secrets** (`k`, master key) from memory
8. **Distribute vault file** to recipient

**On-chain:** One standard P2TR output (Challenge UTXO, 330 sats)

### Recipient Flow (Unseal)

1. **Import vault file** and validate structure
2. **Create PoA transaction** (send required amount to self)
3. **Wait for confirmations** and extract block merkle root
4. **Spend Challenge UTXO** (standard Taproot key-path signature)
5. **Extract adaptor secret `k`** from final signature
6. **Derive unseal key** from `k` and PoA merkle root
7. **Decrypt master key** and payload
8. **Erase secrets** from memory

**On-chain:** Two standard P2TR spends (PoA + Challenge)

---

## Security Model

### Cryptographic Guarantees

- **Soundness:** Without Challenge spend, `k` is hidden (discrete log problem). Without PoA block, merkle root is unknowable. Without both, decryption is impossible.
- **Unforgeability:** Only the recipient's private key can produce a valid Schnorr signature for Challenge spend.
- **Binding:** Output commitment cryptographically binds vault to specific PoA transaction output.
- **Integrity:** AEAD tags authenticate all ciphertext and metadata.

### Privacy Properties

- **On-chain indistinguishability:** Challenge and PoA transactions are standard Taproot key-path spends (no custom scripts).
- **No linkability:** Challenge and PoA transactions are independent (unless address reuse).
- **Forward secrecy:** Sender cannot decrypt after seal (`k` is erased).
- **Minimal metadata:** Vault file reveals recipient address and PoA amount (encrypt vault file for defense-in-depth).

---

## Use Cases

- **Conditional data release:** Unlock documents/keys only after payment proof
- **Escrow-free exchanges:** Atomic data-for-bitcoin swaps
- **Time-locked secrets:** Combine with PoA timelock for future revelation
- **Inheritance planning:** Encrypt data accessible only after specific on-chain events
- **Whistleblower drops:** Anonymous encrypted data with bitcoin-gated access
- **Decentralized dead man's switch:** Auto-release after inactivity (via timelock)

---

## Documentation Structure

### 1. [SPEC.md](SPEC.md) — Technical Specification

**Formal specification covering:**
- Cryptographic primitives (secp256k1, BIP-340 Schnorr, HKDF, AES-GCM)
- Adaptor signature construction and extraction
- Data structures (vault container, output commitment, Challenge UTXO)
- Seal and unseal algorithms (step-by-step)
- Security analysis and attack resistance
- Error handling and validation
- Implementation requirements

**Audience:** Protocol implementers, cryptographers, security auditors

### 2. [PROTOCOL.md](PROTOCOL.md) — Product Flow & Integration Guide

**Product-focused documentation covering:**
- User flows (sender and recipient step-by-step)
- Wallet integration patterns (browser, hardware, air-gapped)
- Error handling and recovery procedures
- Privacy and security guidance
- Operational considerations (fees, timelocks, dust limits)
- Future extensions (multi-recipient, revocable vaults, proof of unseal)

**Audience:** Product managers, UX designers, integration engineers

### 3. [FORMAT.md](FORMAT.md) — Vault Container Format

**Serialization specification covering:**
- JSON schema and field definitions
- Canonical ordering and encoding rules
- Validation constraints and error handling
- Future-proofing and versioning
- Interoperability requirements

**Audience:** Implementation engineers, QA testers

### 4. [TESTPLAN.md](TESTPLAN.md) — Test Vectors & Validation

**Comprehensive test suite covering:**
- Deterministic test vectors for all cryptographic operations
- End-to-end seal and unseal tests
- Negative tests (tampering, wrong keys, invalid inputs)
- Edge cases (dust limits, reorgs, timelocks)
- Interoperability tests (cross-implementation vault exchange)
- Performance benchmarks and security validation

**Audience:** Implementation engineers, QA testers, security auditors

### 5. [RISK.md](RISK.md) — Risk Analysis & Limitations

**Comprehensive risk assessment covering:**
- Cryptographic assumptions (DLP, ECDSA, SHA-256, AES)
- Blockchain assumptions (PoW integrity, transaction finality, reorgs)
- Wallet integration risks (compatibility, security, air-gapped workflows)
- Economic risks (dust economics, fee volatility, timelock risks)
- Privacy risks (on-chain linkability, metadata leakage, network privacy)
- DoS risks (sender/recipient/network-level attacks)
- Implementation risks (software bugs, dependencies, platform security)
- Quantum computing risks (timeline, attack scenarios, migration path)
- Legal and regulatory risks (encryption regulations, financial regulations)
- Operational best practices and incident response

**Audience:** Security teams, risk managers, compliance officers

---

## Quick Start

### For Implementers

1. **Read [SPEC.md](SPEC.md)** for complete technical specification
2. **Review [TESTPLAN.md](TESTPLAN.md)** for test vectors
3. **Implement cryptographic primitives** (HKDF, AES-GCM, secp256k1, adaptor signatures)
4. **Implement seal and unseal algorithms** per SPEC.md
5. **Validate against test vectors** (all tests must pass)
6. **Integrate with Bitcoin wallet** (PSBT signing)
7. **Test with real wallets** (Unisat, Xverse, Ledger, Coldcard)

### For Product Teams

1. **Read [PROTOCOL.md](PROTOCOL.md)** for user flows and UX guidance
2. **Design sender flow** (vault creation, Challenge UTXO funding, vault distribution)
3. **Design recipient flow** (vault import, PoA creation, Challenge spend, decryption)
4. **Implement error handling** (validation errors, PoA errors, Challenge errors, decryption errors)
5. **Test with target wallets** (browser, hardware, air-gapped)
6. **Review [RISK.md](RISK.md)** for security and privacy guidance

### For Security Auditors

1. **Review [SPEC.md](SPEC.md)** for cryptographic design
2. **Review [RISK.md](RISK.md)** for threat model and assumptions
3. **Verify test vectors** in [TESTPLAN.md](TESTPLAN.md)
4. **Audit implementation** for:
   - Correct cryptographic primitive usage
   - Secure random number generation
   - Constant-time operations (timing attack resistance)
   - Secure memory handling (secret zeroing)
   - Input validation and error handling
5. **Perform penetration testing** (tampering, replay, side-channels)

---

## Implementation Checklist

### Cryptographic Primitives

- [ ] secp256k1 point multiplication and scalar arithmetic
- [ ] BIP-340 Schnorr signature generation and verification
- [ ] Adaptor signature pre-signature creation
- [ ] Adaptor secret extraction from final signature
- [ ] HKDF-SHA256 (RFC 5869)
- [ ] AES-256-GCM with AAD
- [ ] SHA-256 and tagged hashing (BIP-340 style)
- [ ] Secure random number generation (CSPRNG)
- [ ] Constant-time operations (libsecp256k1, etc.)
- [ ] Secure memory zeroing

### Vault Operations

- [ ] Seal: Generate vault from payload and rules
- [ ] Unseal: Decrypt vault with PoA and Challenge spend
- [ ] Vault serialization (JSON encoding/decoding)
- [ ] Vault validation (structure, fields, constraints)
- [ ] Output commitment computation
- [ ] Challenge UTXO creation and monitoring

### Blockchain Integration

- [ ] Transaction creation and broadcasting
- [ ] UTXO queries (Challenge UTXO spent status)
- [ ] Block header retrieval and merkle root extraction
- [ ] Confirmation monitoring
- [ ] Reorg detection and handling
- [ ] Fee estimation and RBF support

### Wallet Integration

- [ ] Taproot address generation (Bech32m)
- [ ] PSBT creation (BIP-174, BIP-371)
- [ ] PSBT signing (browser wallet APIs)
- [ ] PSBT finalization and broadcasting
- [ ] Air-gapped support (QR codes, UR encoding, SD card)
- [ ] Hardware wallet support (Ledger, Trezor, Coldcard)

### Testing

- [ ] All cryptographic primitive tests pass
- [ ] All vault serialization tests pass
- [ ] Deterministic seal test passes
- [ ] Successful unseal test passes
- [ ] All negative tests pass (tampering, wrong keys, etc.)
- [ ] Edge case tests pass (dust limits, reorgs, timelocks)
- [ ] Cross-implementation vault exchange succeeds
- [ ] Performance benchmarks meet targets
- [ ] Security validation (constant-time, memory zeroing, randomness)

---

## Dependencies

### Required Libraries

- **secp256k1:** `libsecp256k1` or `@noble/secp256k1` (JavaScript)
- **Cryptography:** OpenSSL, libsodium, or Web Crypto API
- **Bitcoin:** `bitcoinjs-lib`, `rust-bitcoin`, or equivalent
- **PSBT:** BIP-174/BIP-371 compatible library

### Optional Libraries

- **QR codes:** `qrcode`, `ur` (Uniform Resources encoding)
- **Blockchain APIs:** `blockstream.info`, `mempool.space`, or local Bitcoin Core node

---

## Compliance and Interoperability

### Standards Compliance

- **BIP-340:** Schnorr Signatures for secp256k1
- **BIP-341:** Taproot: SegWit version 1 spending rules
- **BIP-174:** Partially Signed Bitcoin Transaction Format
- **BIP-371:** Taproot Fields for PSBT
- **RFC 5869:** HKDF (HMAC-based Key Derivation Function)
- **RFC 6979:** Deterministic Usage of DSA and ECDSA
- **NIST SP 800-38D:** AES-GCM specification

### Interoperability Requirements

- Vaults created by implementation A MUST be unsealed by implementation B
- Identical KDF labels, AEAD AAD construction, and output commitment computation
- Canonical JSON serialization per [FORMAT.md](FORMAT.md)
- Test vectors in [TESTPLAN.md](TESTPLAN.md) MUST pass

---

## Versioning and Future Compatibility

### Current Version

- **Profile:** `lock-v1-taproot-adaptor`
- **Version:** 1.0.0
- **Status:** Implementation-Ready Draft

### Future Versions

- **v2.0:** May introduce post-quantum cryptography, multi-recipient vaults, or revocation
- **Backward compatibility:** NOT guaranteed across major versions
- **Migration:** Users must re-seal vaults for new protocol versions

### Version Detection

- Vault files include `version` field: `"lock-v1-taproot-adaptor"`
- Implementations MUST reject unknown versions (fail-safe)

---

## Contributing

### Feedback and Issues

- **Specification issues:** Open GitHub issue with tag `spec`
- **Implementation questions:** Open GitHub issue with tag `implementation`
- **Security vulnerabilities:** Email security@example.com (responsible disclosure)

### Test Vector Contributions

- Submit deterministic test vectors for edge cases
- Include inputs, expected outputs, and rationale
- Follow format in [TESTPLAN.md](TESTPLAN.md)

### Protocol Improvements

- Propose enhancements via GitHub issue with tag `enhancement`
- Include motivation, design, security analysis, and backward compatibility impact
- Major changes require new protocol version (v2.0+)

---

## License

This specification is released under **CC0 1.0 Universal (Public Domain)**.

Implementations may use any license compatible with their dependencies.

---

## Acknowledgments

- **Bitcoin Core developers:** For Taproot and Schnorr signatures
- **libsecp256k1 contributors:** For constant-time secp256k1 implementation
- **BIP authors:** For standardizing Bitcoin protocols
- **Cryptography researchers:** For adaptor signatures and scriptless scripts

---

## Contact

- **Specification maintainer:** [Your contact info]
- **Reference implementation:** [Link to reference implementation]
- **Community chat:** [Discord/Telegram/Matrix link]
- **Security contact:** security@example.com

---

**End of README**

