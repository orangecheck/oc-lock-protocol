# LOCK Protocol Documentation Summary

This directory contains the complete normative specification and implementation guide for the LOCK (Ledger-Originated Cryptographic Key) protocol.

---

## Document Overview

### Core Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| **[README.md](README.md)** | User-facing overview, quick start, use cases | Developers integrating LOCK |
| **[SPEC.md](SPEC.md)** | Normative specification (REQUIRED for conformance) | Protocol implementers |
| **[PROTOCOL.md](PROTOCOL.md)** | Design rationale, security model, comparisons | Architects, researchers |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Implementation patterns, data flow, testing | System implementers |
| **[REFACTORING.md](REFACTORING.md)** | Codebase refactoring plan and terminology standard | Internal development |

### Registry (Future)

| Document | Purpose |
|----------|---------|
| **registry/algorithms.md** | Encryption algorithm registry |
| **registry/conditions.md** | Amount condition type registry |

---

## Quick Reference

### What is LOCK?

**LOCK = Bitcoin-secured encryption with proof-of-access gating**

```
seal()    → Encrypt payload
bind()    → Anchor to Bitcoin blockchain
unseal()  → Decrypt with on-chain proof
rebind()  → Transfer access without re-encrypting
```

### Core Concepts

**SEAL** — Encrypted payload (ciphertext + nonce + tag)
- Portable `.seal` file
- No policy, no identity
- Think: "locked box"

**Rules (Metadata)** — Encrypted access policy
- Who can unseal (authorized wallet)
- What they must do (amount condition)
- Where funds go (recipient wallet)
- When they can unseal (timelock)
- How many times (unlock limit)

**Bind** — On-chain transaction
- Simple self-spend (no OP_RETURN)
- Creates canonical identity
- Enables auditability

**Vault** — Complete structure
- SEAL + Rules + Bind
- Canonical Vault ID: `SHA-256(SEAL || metadata || txid)`
- Enables rebinding, counters, replay protection

### Why Vault ≠ SEAL?

| Feature | SEAL Only | Vault (SEAL + Rules + Bind) |
|---------|-----------|------------------------------|
| Encryption | ✅ | ✅ |
| Policy enforcement | ❌ | ✅ |
| Canonical identity | ❌ | ✅ |
| Auditability | ❌ | ✅ |
| Rebinding | ❌ | ✅ |
| Unlock counters | ❌ | ✅ |

**Bottom line:** You can't have PoA, rebinding, or auditability with just a SEAL.

---

## Terminology Standard

### When to Use Each Term

**SEAL:**
- File operations: "Import SEAL", "Export SEAL"
- Encryption: `createSeal()`, `sealToBytes()`
- File extension: `.seal`

**Vault:**
- Management: "My Vaults", "Vault Manager"
- Complete structure: `createVault()`, `generateVaultId()`
- Storage: Persisting complete vaults

**Rules (Metadata):**
- Access policy: "Set Rules", "Access Rules"
- Functions: `createSealMetadata()`, `encryptMetadata()`

**Bind:**
- Anchoring: "Bind to Bitcoin", "Binding Transaction"
- Functions: `createBindingPsbt()`, `bind()`

### Code Naming Conventions

```typescript
// SEAL operations
createSeal(payload, key) → SealFile
sealToBytes(seal) → Uint8Array
bytesToSeal(bytes) → SealFile
unsealPayload(seal, key) → Uint8Array

// Vault operations
createSealMetadata(config) → VaultMetadata
encryptMetadata(metadata, key) → Uint8Array
generateVaultId(seal, metadata, txid) → string
createVault(seal, metadata, encryptedMetadata) → Vault

// Binding operations
createBindingPsbt(options) → PsbtResult
bind(seal, metadata, wallet) → txid

// PoA operations
validatePoA(tx, metadata) → PoAValidationResult
```

---

## Protocol Flow

### Complete Flow (seal → bind → unseal)

```
1. Creator: Create SEAL
   ├─ Generate payload
   ├─ Derive encryption key (ECDH + HKDF)
   ├─ createSeal(payload, sealKey)
   └─ Result: SealFile

2. Creator: Define Rules
   ├─ createSealMetadata({ authorizedWallet, amountCondition, ... })
   ├─ encryptMetadata(metadata, metadataKey)
   └─ Result: VaultMetadata + encrypted bytes

3. Creator: Bind to Bitcoin
   ├─ createBindingPsbt({ address, utxos, metadata })
   ├─ Sign PSBT with wallet
   ├─ Broadcast transaction
   ├─ Wait for confirmation
   └─ Result: txid

4. Creator: Create Vault
   ├─ createVault(seal, metadata, encryptedMetadata)
   ├─ Add bindingTxid
   ├─ generateVaultId(seal, metadata, txid)
   └─ Result: Complete Vault

5. Creator: Share SEAL
   ├─ Export SEAL file (.seal)
   ├─ Share with recipient
   └─ Recipient imports SEAL

6. Recipient: Perform PoA
   ├─ Create transaction satisfying Rules
   ├─ Send required amount to recipient
   ├─ Wait for confirmation
   └─ Result: PoA transaction

7. Recipient: Unseal
   ├─ validatePoA(poaTx, metadata)
   ├─ If valid: unsealPayload(seal, sealKey)
   ├─ Increment unlock counter
   └─ Result: Decrypted payload
```

### Rebinding Flow

```
1. Current owner: Decide to transfer
2. Create new Rules (new authorized wallet)
3. rebind(vault, newMetadata, wallet)
   ├─ Keep SEAL unchanged
   ├─ Encrypt new metadata
   ├─ Create new binding transaction
   ├─ Broadcast and confirm
   └─ Result: New Vault (same SEAL, new metadata, new txid)
4. New Vault ID computed
5. Old Vault still valid (rebinding doesn't invalidate)
```

---

## Security Model

### Key Derivation (ECDH + HKDF)

```
1. Creator generates ephemeral keypair
2. ECDH with recipient's pubkey → shared_secret
3. HKDF(shared_secret || seal_hash) → { metadataKey, sealKey }
4. Encrypt SEAL and metadata
5. Prove ephemeral key ownership at bind() time
```

**Important:** Key derivation does NOT use TXID, so you can seal before binding.

### Proof-of-Access Validation

PoA transaction MUST satisfy ALL conditions:

- ✅ Confirmed (≥1 confirmation)
- ✅ Non-RBF (not replaceable)
- ✅ Wallet match (from authorized wallet)
- ✅ Recipient match (to required recipient)
- ✅ Amount match (satisfies condition)
- ✅ Time lock (after specified block height)
- ✅ Unlock limit (not exceeded)

### Threat Model

**Protected against:**
- Passive network observers (encryption)
- Unauthorized unsealing (PoA validation)
- Replay attacks (unlock counters)
- RBF double-spend (RBF check)
- Tampering (authentication tags)

**Not protected against:**
- Quantum computers (secp256k1 vulnerable)
- Compromised devices (malware)
- Social engineering (phishing)
- Bitcoin consensus failures (51% attacks)

---

## Implementation Checklist

### Conforming Implementation MUST:

- [ ] Support AES-256-GCM encryption
- [ ] Serialize SEAL files per binary format (SPEC.md §2.1)
- [ ] Encrypt/decrypt metadata per spec (SPEC.md §3.3)
- [ ] Compute Vault IDs correctly (SPEC.md §4.2)
- [ ] Implement all four operations: seal(), bind(), unseal(), rebind()
- [ ] Validate PoA transactions (all checks in SPEC.md §6)
- [ ] Derive keys per ECDH + HKDF spec (SPEC.md §7)
- [ ] Return specified error codes (SPEC.md §9)

### Conforming Implementation MAY:

- [ ] Support ChaCha20-Poly1305 encryption
- [ ] Implement additional amount condition types
- [ ] Add custom metadata fields
- [ ] Implement UI/UX features beyond protocol

---

## Use Cases

### Secure Messaging (SealChat)

```typescript
const seal = await createSeal(message, sealKey);
const metadata = createSealMetadata({
  authorizedWallet: bobAddress,
  amountCondition: { type: 'fixed', amount: 546 },
  recipientWallet: 'self',
});
```

### Dead Man's Switch

```typescript
const metadata = createSealMetadata({
  authorizedWallet: heirAddress,
  amountCondition: { type: 'fixed', amount: 1000 },
  timeLock: currentBlock + 52560, // ~1 year
  unlockLimit: 1,
});
```

### Paid Content

```typescript
const metadata = createSealMetadata({
  authorizedWallet: 'ANY',
  amountCondition: { type: 'fixed', amount: 100000 },
  recipientWallet: creatorAddress,
  unlockLimit: undefined, // Unlimited
});
```

### Multi-Sig Vault

```typescript
const metadata = createSealMetadata({
  authorizedWallet: [alice, bob, carol],
  amountCondition: { type: 'fixed', amount: 1000 },
  unlockLimit: 1, // First to unlock wins
});
```

---

## File Formats

### SEAL File (.seal)

**Binary structure:**
```
[SEAL][1][0x01][12][nonce...][tag...][len][ciphertext...][hintLen][hint...]
```

**Example:**
```
53 45 41 4C  01 01 0C  [12 bytes nonce]  [16 bytes tag]
[4 bytes len]  [ciphertext...]  [2 bytes hint len]  [hint...]
```

### Vault JSON (storage)

```json
{
  "id": "abc123...",
  "seal": {
    "version": 1,
    "encryptionAlgorithm": "AES-256-GCM",
    "nonce": "...",
    "ciphertext": "...",
    "integrityTag": "...",
    "metadataHint": "text/plain"
  },
  "metadata": {
    "version": 1,
    "authorizedWallet": "bc1q...",
    "amountCondition": { "type": "fixed", "amount": 10000 },
    "recipientWallet": "self",
    "visibility": "encrypted",
    "txid": "abc123..."
  },
  "encryptedMetadata": "...",
  "createdAt": 1234567890000,
  "bindingTxid": "abc123..."
}
```

---

## Next Steps

### For Protocol Implementers

1. Read **[SPEC.md](SPEC.md)** — Normative requirements
2. Read **[ARCHITECTURE.md](ARCHITECTURE.md)** — Implementation patterns
3. Implement conformance checklist
4. Test against reference implementation
5. Submit conformance report

### For Application Developers

1. Read **[README.md](README.md)** — Quick start guide
2. Read **[PROTOCOL.md](PROTOCOL.md)** — Design rationale
3. Choose use case (messaging, vault, etc.)
4. Integrate LOCK library
5. Build UI/UX

### For Researchers

1. Read **[PROTOCOL.md](PROTOCOL.md)** — Security model
2. Review threat model and limitations
3. Propose extensions or improvements
4. Submit to registry (algorithms, conditions)

---

## Contributing

- Read **SPEC.md** first; proposals must not break canonicalization
- Open issues/PRs with **clear diffs** and **test vectors**
- For new algorithms, update **registry/algorithms.md**
- For new condition types, update **registry/conditions.md**

---

## License

- **Protocol & Spec text**: CC‑BY‑4.0
- **Reference code**: MIT

---

**Built with Bitcoin. Secured by proof. Portable everywhere.**

