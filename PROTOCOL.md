---
title: LOCK Protocol
status: Draft
version: v1
license: CC-BY-4.0
audience: architects, protocol designers, security researchers
---

# LOCK Protocol

*Bitcoin-secured encryption with proof-of-access gating. A tiny protocol for non-custodial, rebindable, auditable encryption.*

## 1) Problem & Goals

**Problem.** Current encryption solutions require trust in third parties (custodial keys), lack verifiable access control, and cannot transfer access without re-encryption.

**Goals**
- **Non-custodial** — Users control keys; no trusted third parties
- **Verifiable access** — On-chain proof required to decrypt
- **Rebindable** — Transfer access without re-encrypting payload
- **Auditable** — All access attempts visible on blockchain
- **Portable** — `.seal` files work across any LOCK-compatible client
- **Privacy-aware** — Metadata encrypted; optional public SEALs

**Non-goals (v1)**
- Multi-party computation (MPC) encryption
- Zero-knowledge proofs of access
- On-chain storage of SEALs (too expensive)
- Cross-chain support (Bitcoin only)

## 2) Roles

- **Creator** — Entity creating and sealing content
- **Recipient** — Entity authorized to unseal content
- **Unlocker** — Entity performing PoA transaction (may be same as Recipient)
- **Verifier** — Any party validating PoA transactions
- **Relayer** — Optional service distributing SEAL files

> In typical flows, Creator and Recipient are different parties, but self-sealing (Creator = Recipient) is supported for personal vaults.

## 3) Core Concepts

### 3.1 SEAL vs Vault

**SEAL** — The encrypted blob:
- Ciphertext + nonce + authentication tag
- Portable, self-contained
- No policy, no identity, no on-chain component
- Think: "locked box"

**Vault** — The complete system:
- SEAL (encrypted payload)
- Rules (encrypted metadata: who, what, when, how many)
- Bind (on-chain transaction creating canonical identity)
- Vault ID (content-addressed identifier)

**Why the distinction matters:**

| Feature | SEAL Only | Vault (SEAL + Rules + Bind) |
|---------|-----------|------------------------------|
| Encryption | ✅ | ✅ |
| Policy enforcement | ❌ | ✅ (Rules) |
| Canonical identity | ❌ | ✅ (Vault ID) |
| Auditability | ❌ | ✅ (on-chain Bind) |
| Rebinding | ❌ | ✅ (new Bind, same SEAL) |
| Unlock counters | ❌ | ✅ (tracked by Vault ID) |
| Replay protection | ❌ | ✅ (per-vault tracking) |

**Analogy:** SEAL is like a locked box. Vault is like a safe deposit box with access logs, transfer records, and usage limits.

### 3.2 The Four Operations

```
seal()    → Create encrypted SEAL from payload
bind()    → Anchor SEAL + Rules to blockchain
unseal()  → Decrypt SEAL after PoA validation
rebind()  → Transfer access to new wallet
```

**Flow:**
```
1. Creator: seal(payload) → SEAL
2. Creator: bind(SEAL, Rules) → Vault + TXID
3. Recipient: PoA transaction → on-chain proof
4. Recipient: unseal(SEAL, PoA) → payload
5. (Optional) Recipient: rebind(Vault, newRules) → new Vault
```

### 3.3 Proof-of-Access (PoA)

PoA is a **confirmed, non-RBF Bitcoin transaction** that satisfies all Rules:

**Required checks:**
1. ✅ **Confirmed** — At least 1 confirmation
2. ✅ **Non-RBF** — Not replaceable (prevents double-spend attacks)
3. ✅ **Wallet match** — From authorized wallet
4. ✅ **Recipient match** — To required recipient (if specified)
5. ✅ **Amount match** — Satisfies amount condition
6. ✅ **Time lock** — After specified block height (if set)
7. ✅ **Unlock limit** — Not exceeded (if set)

**Why on-chain?**
- **Verifiable** — Anyone can validate PoA independently
- **Auditable** — Permanent record of access attempts
- **Sybil-resistant** — Costs real sats to unlock
- **Timestamped** — Block height provides ordering

**Why confirmed + non-RBF?**
- **Prevents double-spend** — Can't replace PoA after unsealing
- **Finality** — Once confirmed, access is permanent
- **Replay protection** — Same txid can't be reused

## 4) Access Rules (Metadata)

Rules define **who** can unseal, **when**, **how**, and **how many times**.

### 4.1 Authorized Wallet

**Single wallet:**
```json
{ "authorizedWallet": "bc1q..." }
```
Only this address can unseal.

**Multiple wallets:**
```json
{ "authorizedWallet": ["bc1q...", "bc1p...", "bc1q..."] }
```
Any of these addresses can unseal (OR logic).

**Public SEAL:**
```json
{ "authorizedWallet": "ANY" }
```
Anyone can unseal (useful for paid content).

### 4.2 Amount Condition

**Fixed amount:**
```json
{ "amountCondition": { "type": "fixed", "amount": 10000 } }
```
PoA must send exactly 10,000 sats.

**Range amount:**
```json
{ "amountCondition": { "type": "range", "min": 1000, "max": 100000 } }
```
PoA must send between 1,000 and 100,000 sats.

**Use cases:**
- Fixed: Exact payment required (e.g., $10 worth of sats)
- Range: Flexible payment (e.g., "pay what you want" between min/max)

### 4.3 Recipient Wallet

**Self-spend:**
```json
{ "recipientWallet": "self" }
```
PoA sends to same address as sender (proof of control).

**Specific recipient:**
```json
{ "recipientWallet": "bc1q..." }
```
PoA must send to this address (payment to creator).

**Use cases:**
- Self: Prove wallet control without losing funds
- Specific: Pay creator to unlock content

### 4.4 Time Lock

```json
{ "timeLock": 850000 }
```
Cannot unseal before block 850,000.

**Use cases:**
- Dead man's switch (release after time)
- Scheduled content release
- Embargo periods

### 4.5 Unlock Limit

```json
{ "unlockLimit": 5 }
```
Maximum 5 successful unseals.

**Use cases:**
- One-time secrets (limit: 1)
- Limited access (limit: N)
- Unlimited (omit field or set to undefined)

## 5) Key Derivation

LOCK uses **ECDH + HKDF** to derive encryption keys from a shared secret.

### 5.1 Why ECDH?

**Problem:** How do Creator and Recipient share encryption keys without a secure channel?

**Solution:** Elliptic Curve Diffie-Hellman (ECDH)
1. Creator generates ephemeral keypair (creatorPriv, creatorPub)
2. Creator performs ECDH with Recipient's public key
3. Result: 32-byte shared secret
4. Derive encryption keys from shared secret

**Benefits:**
- No pre-shared keys required
- No secure channel needed
- Recipient can derive same keys using their private key

### 5.2 Why HKDF?

**Problem:** Shared secret alone isn't suitable as encryption key.

**Solution:** HKDF (HMAC-based Key Derivation Function)
- Expands shared secret into multiple keys
- Binds keys to specific purposes (metadata vs SEAL)
- Includes SEAL hash for key separation

**Derivation:**
```
shared_secret = ECDH(creatorPriv, recipientPub)
seal_hash = SHA-256(SEAL_bytes)

metadataKey = HKDF-SHA256(
  ikm: shared_secret,
  salt: "LOCK-METADATA",
  info: "metadata-encryption-v1" || seal_hash,
  length: 32
)

sealKey = HKDF-SHA256(
  ikm: shared_secret,
  salt: "LOCK-SEAL",
  info: "seal-encryption-v1" || seal_hash,
  length: 32
)
```

**Key properties:**
- Different keys for metadata and SEAL
- Keys bound to specific SEAL (via seal_hash)
- Deterministic (same inputs → same keys)
- One-way (can't derive shared_secret from keys)

### 5.3 When to Derive Keys

**Important:** Key derivation does NOT use TXID.

**Why?** You can seal BEFORE binding to blockchain.

**Flow:**
1. Creator: Generate ephemeral keypair
2. Creator: ECDH with Recipient pubkey → shared_secret
3. Creator: HKDF → metadataKey, sealKey
4. Creator: Encrypt SEAL and metadata
5. Creator: Prove ephemeral key ownership at bind() time
6. Creator: Broadcast binding transaction

**Benefit:** Seal offline, bind later.

## 6) Vault ID

Vault ID is a **content-addressed identifier** computed as:

```
vault_id = SHA-256(SEAL_bytes || metadata_bytes || txid_bytes)
```

**Properties:**
- **Deterministic** — Same inputs always produce same ID
- **Unique** — Different inputs produce different IDs (with high probability)
- **Content-addressed** — ID changes if any component changes
- **Canonical** — Single source of truth for vault identity

**Use cases:**
- Lookup vaults in storage
- Track unlock counters per vault
- Audit access history
- Prevent replay attacks

**Rebinding creates new Vault ID:**
```
Original: vault_id_1 = SHA-256(SEAL || metadata_1 || txid_1)
Rebound:  vault_id_2 = SHA-256(SEAL || metadata_2 || txid_2)
```
Same SEAL, different metadata/txid → different Vault ID.

## 7) Rebinding

Rebinding transfers vault access to a new wallet **without re-encrypting the SEAL**.

### 7.1 Why Rebind?

**Use cases:**
- Transfer ownership of encrypted content
- Change access conditions (amount, timelock, etc.)
- Rotate authorized wallets
- Update recipient address

**Without rebinding:**
1. Decrypt SEAL with old key
2. Re-encrypt with new key
3. Create new SEAL
4. Distribute new SEAL file

**With rebinding:**
1. Create new Rules (new authorized wallet)
2. Create new binding transaction
3. Compute new Vault ID
4. Same SEAL file works with new Rules

### 7.2 Rebinding Process

**Input:**
- Original Vault (SEAL, metadata_1, txid_1)
- New Rules (metadata_2, without txid)

**Process:**
1. Keep SEAL unchanged
2. Encrypt new metadata (metadata_2)
3. Create new binding transaction (txid_2)
4. Compute new Vault ID: `SHA-256(SEAL || metadata_2 || txid_2)`
5. New Vault: (SEAL, metadata_2, txid_2, new_vault_id)

**Result:**
- Same SEAL (ciphertext, nonce, tag unchanged)
- New Rules (different authorized wallet, conditions, etc.)
- New Vault ID (different identity)
- Old Vault still valid (rebinding doesn't invalidate original)

### 7.3 Security Implications

**SEAL never changes:**
- Same ciphertext → no re-encryption needed
- Same authentication tag → integrity preserved
- Same nonce → no nonce reuse issues

**Metadata changes:**
- New authorized wallet → different party can unseal
- New amount condition → different PoA requirements
- New timelock → different timing constraints

**Vault ID changes:**
- New identity → separate unlock counter
- New audit trail → independent access history
- Old Vault ID still valid → original Rules still enforceable

## 8) Security Model

### 8.1 Threat Model

**In scope:**
- Passive network observers
- Malicious relayers (distributing SEALs)
- Unauthorized parties attempting to unseal
- Replay attacks (reusing PoA transactions)
- RBF double-spend attacks

**Out of scope:**
- Quantum computers (secp256k1 vulnerable)
- Compromised user devices (malware)
- Social engineering (phishing for keys)
- Bitcoin consensus failures (51% attacks)

### 8.2 Security Properties

**Confidentiality:**
- SEAL ciphertext is AES-256-GCM encrypted
- Metadata is AES-256-GCM encrypted
- Keys derived from ECDH shared secret
- Passive observers cannot decrypt

**Integrity:**
- Authentication tags prevent tampering
- Vault ID binds SEAL + metadata + txid
- Any modification invalidates Vault ID

**Access control:**
- PoA validation enforces Rules
- On-chain proof required to unseal
- Unauthorized parties cannot decrypt

**Auditability:**
- All PoA transactions on blockchain
- Unlock counters tracked per Vault ID
- Access history publicly verifiable

**Replay protection:**
- Unlock counters prevent reuse
- Txid tracking prevents same PoA twice
- RBF protection prevents double-spend

### 8.3 Known Limitations

**SEAL file size reveals payload size:**
- Ciphertext length ≈ plaintext length
- Mitigation: Pad payloads to standard sizes

**Metadata hints are plaintext:**
- MIME types visible to observers
- Mitigation: Don't include sensitive hints

**Authorized wallet linkability:**
- PoA transactions link wallet to Vault ID
- Mitigation: Use fresh wallets per vault

**Unlock counters require persistent storage:**
- Clients must track counters across sessions
- Mitigation: Store in encrypted local storage

## 9) Comparison to Alternatives

### 9.1 vs PGP/GPG

| Feature | PGP | LOCK |
|---------|-----|------|
| Key distribution | Web of trust | Bitcoin addresses |
| Access control | None | On-chain PoA |
| Auditability | None | Blockchain |
| Rebinding | No | Yes |
| Proof of access | No | Yes |

### 9.2 vs Signal/WhatsApp

| Feature | Signal | LOCK |
|---------|--------|------|
| Custody | Signal servers | Non-custodial |
| Access control | None | On-chain PoA |
| Portability | Signal only | Any LOCK client |
| Auditability | None | Blockchain |
| Rebinding | No | Yes |

### 9.3 vs Nostr NIP-04/NIP-44

| Feature | Nostr | LOCK |
|---------|-------|------|
| Access control | None | On-chain PoA |
| Auditability | Relay-dependent | Blockchain |
| Rebinding | No | Yes |
| Proof of access | No | Yes |
| Unlock limits | No | Yes |

## 10) Future Extensions

**Potential additions (not in v1):**

- **Multi-party SEALs** — Require M-of-N PoA transactions
- **Conditional unsealing** — Complex boolean logic for Rules
- **Cross-chain PoA** — Accept PoA from other blockchains
- **ZK proofs** — Prove PoA without revealing transaction
- **Threshold encryption** — Split keys across multiple parties
- **Revocation** — Invalidate vault before timelock expires

---

## Appendix A: Terminology Clarification

**Why "SEAL" and not "encrypted file"?**
- SEAL is a specific format (§2 in SPEC.md)
- Not all encrypted files are SEALs
- SEAL implies LOCK protocol compliance

**Why "Vault" and not "SEAL"?**
- Vault = SEAL + Rules + Bind
- Enables features impossible with SEAL alone
- Clear separation of concerns

**Why "Rules" and not "metadata"?**
- "Metadata" is ambiguous (could mean file metadata)
- "Rules" clearly indicates access control policy
- Aligns with "who, what, when, how many" framing

**Why "Bind" and not "anchor"?**
- "Bind" matches protocol operation name
- "Anchor" could imply OP_RETURN (which we don't use)
- "Bind" emphasizes creating canonical identity

**Why "Proof-of-Access" and not "proof-of-payment"?**
- Not all PoA transactions are payments (self-spend)
- "Access" emphasizes authorization, not commerce
- Aligns with access control framing

---

**Built with Bitcoin. Secured by proof. Portable everywhere.**

