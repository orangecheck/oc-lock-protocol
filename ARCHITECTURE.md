---
title: LOCK Protocol — Architecture
status: Draft
version: 1.0
license: CC-BY-4.0
audience: implementers, system architects
---

# LOCK Protocol — Architecture

This document describes the system architecture, data flow, and implementation patterns for LOCK protocol clients.

---

## 1) System Overview

### 1.1 Component Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                    │
│     (SealChat, File Vault, Dead Man's Switch, etc.)     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   LOCK Protocol Layer                   │
│        seal() | bind() | unseal() | rebind()            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────┬──────────────────┬───────────────────┐
│  Crypto Layer    │  Bitcoin Layer   │  Storage Layer    │
│  AES-GCM, ECDH   │  PSBT, PoA       │  IndexedDB, FS    │
│  HKDF, SHA-256   │  Validation      │  LocalStorage     │
└──────────────────┴──────────────────┴───────────────────┘
```

### 1.2 Core Modules

**Protocol Core:**
- `seal.ts` — SEAL creation and unsealing
- `bind.ts` — Binding transaction creation
- `rebind.ts` — Rebinding operations
- `poa.ts` — Proof-of-Access validation

**Cryptography:**
- `crypto.ts` — AES-GCM, SHA-256 primitives
- `keyDerivation.ts` — ECDH + HKDF key derivation

**Bitcoin Integration:**
- `psbt.ts` — PSBT creation and signing
- `blockchainStatus.ts` — Transaction confirmation tracking

**Data Management:**
- `serialization.ts` — SEAL binary format
- `sealSerialization.ts` — Vault serialization
- `types.ts` — TypeScript type definitions
- `schemas/` — Zod runtime validation schemas

---

## 2) Data Structures

### 2.1 SEAL File

**In-memory representation:**
```typescript
interface SealFile {
  version: number;              // Format version (1)
  encryptionAlgorithm: string;  // "AES-256-GCM"
  nonce: Uint8Array;            // 12 bytes
  ciphertext: Uint8Array;       // Variable length
  integrityTag: Uint8Array;     // 16 bytes
  metadataHint?: string;        // Optional MIME type
}
```

**Binary format:**
```
[SEAL][1][0x01][12][nonce...][tag...][len][ciphertext...][hintLen][hint...]
 4B    1B  1B   1B   12B       16B     4B   variable      2B        variable
```

### 2.2 Vault Metadata (Rules)

**Structure:**
```typescript
interface VaultMetadata {
  version: number;
  authorizedWallet: string | string[] | "ANY";
  recipientWallet?: string | "self";
  amountCondition: {
    type: "fixed" | "range";
    amount?: number;
    min?: number;
    max?: number;
  };
  timeLock?: number;
  unlockLimit?: number;
  visibility: "encrypted";
  txid?: string;
}
```

**Encrypted format:**
```
[nonce(12)][tag(16)][ciphertext(JSON)]
```

### 2.3 Vault

**Complete structure:**
```typescript
interface Vault {
  id: string;                    // SHA-256 hash (64 hex)
  seal: SealFile;                // SEAL file object
  metadata: VaultMetadata;       // Decrypted rules
  encryptedMetadata: Uint8Array; // Encrypted rules bytes
  createdAt: number;             // Unix timestamp (ms)
  bindingTxid?: string;          // Binding TX ID
}
```

**With UI metadata:**
```typescript
interface VaultWithMetadata extends Vault {
  status: "pending" | "locked" | "unlocked" | "error";
  lastModified: number;
  unlockCount: number;
  label?: string;
  tags?: string[];
  origin: "created" | "imported";
  importMethod?: "file" | "paste" | "qr" | "url";
  decryptedPayload?: Uint8Array;
  bindingStatus?: TransactionStatusInfo;
  unlockStatus?: TransactionStatusInfo;
}
```

---

## 3) Operation Flows

### 3.1 seal() — Create SEAL

```
Input: payload, sealKey, options
  ↓
Generate random nonce (12 bytes)
  ↓
Encrypt with AES-256-GCM
  ↓
Extract ciphertext + tag
  ↓
Create SealFile object
  ↓
Output: SealFile
```

**Implementation:**
```typescript
async function createSeal(
  payload: Uint8Array,
  key: Uint8Array,
  options?: { metadataHint?: string }
): Promise<SealFile> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const { ciphertext, tag } = await encryptAesGcm(payload, key, nonce);
  
  return {
    version: 1,
    encryptionAlgorithm: "AES-256-GCM",
    nonce,
    ciphertext,
    integrityTag: tag,
    metadataHint: options?.metadataHint,
  };
}
```

### 3.2 bind() — Anchor to Blockchain

```
Input: seal, metadata, encryptedMetadata, wallet
  ↓
Create PSBT for self-spend
  ↓
Select UTXOs from authorized wallet
  ↓
Create output (input amount - fee)
  ↓
Sign PSBT with wallet
  ↓
Broadcast transaction
  ↓
Wait for confirmation (≥1)
  ↓
Compute Vault ID
  ↓
Output: Vault + txid
```

**PSBT Structure:**
```
Inputs:  [UTXO from authorizedWallet]
Outputs: [authorizedWallet: amount - fee]
```

**No OP_RETURN:** Binding is a simple self-spend, no data embedded.

### 3.3 unseal() — Decrypt with PoA

```
Input: seal, sealKey, poaTx, metadata
  ↓
Validate PoA transaction:
  - Confirmed (≥1 conf)
  - Non-RBF
  - Wallet match
  - Recipient match
  - Amount match
  - Time lock satisfied
  - Unlock limit OK
  ↓
If validation fails → Error
  ↓
Decrypt SEAL ciphertext
  ↓
Verify authentication tag
  ↓
Increment unlock counter
  ↓
Output: decrypted payload
```

**PoA Validation:**
```typescript
async function validatePoA(
  tx: BitcoinTransaction,
  metadata: VaultMetadata
): Promise<PoAValidationResult> {
  const checks = {
    txConfirmed: tx.confirmations >= 1,
    notRbf: !tx.rbf,
    walletMatch: checkWalletMatch(tx, metadata.authorizedWallet),
    recipientMatch: checkRecipientMatch(tx, metadata.recipientWallet),
    amountMatch: checkAmountMatch(tx, metadata.amountCondition),
    timeLockSatisfied: checkTimeLock(tx, metadata.timeLock),
    unlockLimitOk: checkUnlockLimit(vaultId, metadata.unlockLimit),
  };
  
  const valid = Object.values(checks).every(Boolean);
  return { valid, details: checks, errors: [], warnings: [] };
}
```

### 3.4 rebind() — Transfer Access

```
Input: vault, newMetadata, wallet
  ↓
Keep SEAL unchanged
  ↓
Encrypt new metadata
  ↓
Create new binding PSBT
  ↓
Sign and broadcast
  ↓
Wait for confirmation
  ↓
Compute new Vault ID
  ↓
Output: new Vault (same SEAL, new metadata, new txid)
```

**Key insight:** SEAL ciphertext never changes, only metadata and binding.

---

## 4) Key Derivation Flow

### 4.1 ECDH Setup

```
Creator:
  1. Generate ephemeral keypair (creatorPriv, creatorPub)
  2. Get recipient's public key (recipientPub)
  3. Compute: shared_secret = ECDH(creatorPriv, recipientPub)

Recipient:
  1. Get creator's public key (creatorPub)
  2. Use own private key (recipientPriv)
  3. Compute: shared_secret = ECDH(recipientPriv, creatorPub)

Result: Both parties have same shared_secret
```

### 4.2 HKDF Derivation

```
Input: shared_secret (32 bytes)
  ↓
Compute seal_hash = SHA-256(SEAL_bytes)
  ↓
Derive metadata key:
  metadataKey = HKDF-SHA256(
    ikm: shared_secret,
    salt: "LOCK-METADATA",
    info: "metadata-encryption-v1" || seal_hash,
    length: 32
  )
  ↓
Derive SEAL key:
  sealKey = HKDF-SHA256(
    ikm: shared_secret,
    salt: "LOCK-SEAL",
    info: "seal-encryption-v1" || seal_hash,
    length: 32
  )
  ↓
Output: { metadataKey, sealKey }
```

**Why include seal_hash in info?**
- Binds keys to specific SEAL
- Different SEALs → different keys (even with same shared_secret)
- Prevents key reuse across vaults

---

## 5) Storage Architecture

### 5.1 Client-Side Storage

**IndexedDB (primary):**
```
Database: "lock_vaults"
  Store: "vaults"
    Key: vault_id (string)
    Value: VaultWithMetadata (object)
  
  Store: "unlock_counters"
    Key: vault_id (string)
    Value: UnlockCounter (object)
```

**LocalStorage (fallback):**
```
Key: "lock_vaults_real" | "lock_vaults_demo"
Value: JSON array of VaultWithMetadata
```

**File System (export):**
```
Format: .seal files (binary SEAL format)
Naming: {label}_{timestamp}.seal
```

### 5.2 Data Persistence

**What to persist:**
- ✅ Vault objects (SEAL + metadata + txid)
- ✅ Unlock counters (per vault_id)
- ✅ Decrypted payloads (optional, encrypted at rest)
- ✅ UI metadata (labels, tags, status)

**What NOT to persist:**
- ❌ Encryption keys (derive on-demand)
- ❌ Unconfirmed transactions (re-fetch from blockchain)
- ❌ Temporary PoA validation results

### 5.3 Demo Mode

**Separate storage:**
```
Real mode:  "lock_vaults_real"
Demo mode:  "lock_vaults_demo"
```

**Demo data:**
- Fake wallet addresses (bc1qdemo...)
- Fake transaction IDs (0000...0001)
- Simulated confirmations
- No actual blockchain interaction

---

## 6) Bitcoin Integration

### 6.1 PSBT Creation

**For binding:**
```typescript
function createBindingPsbt(options: {
  address: string;
  utxos: UTXO[];
  metadata: VaultMetadata;
  feeRate: number;
}): PsbtResult {
  // Select UTXOs
  const selected = selectUtxos(utxos, metadata.amountCondition);
  
  // Create PSBT
  const psbt = new Psbt({ network });
  
  // Add inputs
  selected.forEach(utxo => {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: addressToScript(utxo.address),
        value: utxo.value,
      },
    });
  });
  
  // Add output (self-spend)
  const totalInput = selected.reduce((sum, u) => sum + u.value, 0);
  const fee = estimateFee(selected.length, 1, feeRate);
  const outputAmount = totalInput - fee;
  
  psbt.addOutput({
    address: options.address,
    value: outputAmount,
  });
  
  return { psbt: psbt.toBase64(), estimatedFee: fee };
}
```

### 6.2 Transaction Validation

**Fetch transaction:**
```typescript
async function fetchTransaction(txid: string): Promise<BitcoinTransaction> {
  const response = await fetch(`${ESPLORA_API}/tx/${txid}`);
  const tx = await response.json();
  
  return {
    txid: tx.txid,
    inputs: tx.vin.map(parseInput),
    outputs: tx.vout.map(parseOutput),
    blockHeight: tx.status.block_height,
    confirmations: tx.status.confirmed ? 
      (currentHeight - tx.status.block_height + 1) : 0,
    rbf: tx.vin.some(input => input.sequence < 0xFFFFFFFE),
  };
}
```

**Check RBF:**
```typescript
function isRbf(tx: BitcoinTransaction): boolean {
  return tx.inputs.some(input => input.sequence < 0xFFFFFFFE);
}
```

### 6.3 Blockchain Status Tracking

**Transaction states:**
```
pending      → Not yet broadcast
broadcasting → Broadcast in progress
mempool      → In mempool, 0 confirmations
confirming   → 1+ confirmations, < required
confirmed    → ≥ required confirmations
failed       → Broadcast failed or rejected
unknown      → Cannot determine status
```

**Polling strategy:**
```typescript
async function pollTransactionStatus(
  txid: string,
  requiredConfs: number = 1
): Promise<TransactionStatusInfo> {
  const tx = await fetchTransaction(txid);
  
  if (!tx) {
    return { status: "unknown", confirmations: 0, requiredConfs };
  }
  
  if (tx.confirmations === 0) {
    return { status: "mempool", confirmations: 0, requiredConfs };
  }
  
  if (tx.confirmations < requiredConfs) {
    return { status: "confirming", confirmations: tx.confirmations, requiredConfs };
  }
  
  return { status: "confirmed", confirmations: tx.confirmations, requiredConfs };
}
```

---

## 7) Error Handling

### 7.1 Error Hierarchy

```
LockError (base)
  ├─ EncryptionError
  ├─ DecryptionError
  ├─ IntegrityCheckError
  ├─ ValidationError
  │   ├─ PoAValidationError
  │   ├─ MetadataValidationError
  │   └─ SealFormatError
  ├─ KeyDerivationError
  ├─ PsbtError
  └─ NetworkError
```

### 7.2 Error Codes

**SEAL errors:**
- `INVALID_SEAL_FORMAT` — Binary format invalid
- `INVALID_SEAL_MAGIC` — Magic bytes ≠ "SEAL"
- `ENCRYPTION_FAILED` — Encryption operation failed
- `DECRYPTION_FAILED` — Decryption operation failed
- `INTEGRITY_CHECK_FAILED` — Auth tag mismatch

**PoA errors:**
- `POA_VALIDATION_FAILED` — PoA doesn't satisfy rules
- `WALLET_MISMATCH` — Not from authorized wallet
- `AMOUNT_MISMATCH` — Amount doesn't satisfy condition
- `TIME_LOCK_NOT_MET` — Before timelock height
- `UNLOCK_LIMIT_EXCEEDED` — Too many unseals
- `TX_NOT_CONFIRMED` — Transaction unconfirmed
- `TX_IS_RBF` — Transaction is RBF-enabled

### 7.3 Error Recovery

**Transient errors (retry):**
- Network errors
- Blockchain API timeouts
- Temporary storage failures

**Permanent errors (fail):**
- Invalid SEAL format
- Integrity check failures
- PoA validation failures

---

## 8) Implementation Patterns

### 8.1 Schema-First Design

**Single source of truth:**
```typescript
// schemas/vault-schema.ts
export const vaultSchema = z.object({
  id: vaultIdSchema,
  seal: sealFileSchema,
  metadata: vaultMetadataSchema,
  // ...
});

export type Vault = z.infer<typeof vaultSchema>;
```

**Runtime validation:**
```typescript
function validateVault(data: unknown): Vault {
  return vaultSchema.parse(data); // Throws if invalid
}
```

### 8.2 Functional Core, Imperative Shell

**Pure functions (core):**
```typescript
// Pure: no side effects
function computeVaultId(
  sealBytes: Uint8Array,
  metadataBytes: Uint8Array,
  txid: string
): string {
  const txidBytes = hexToBytes(txid).reverse();
  const combined = concat(sealBytes, metadataBytes, txidBytes);
  return bytesToHex(sha256(combined));
}
```

**Impure functions (shell):**
```typescript
// Impure: side effects (storage, network)
async function saveVault(vault: Vault): Promise<void> {
  await db.vaults.put(vault.id, vault);
}
```

### 8.3 Context-Based State Management

**React context:**
```typescript
interface SealContextValue {
  seals: VaultWithMetadata[];
  createSeal: (payload: Uint8Array, metadata: VaultMetadata) => Promise<Vault>;
  importSeal: (file: File) => Promise<Vault>;
  unsealVault: (vaultId: string, poaTx: BitcoinTransaction) => Promise<Uint8Array>;
  rebindVault: (vaultId: string, newMetadata: VaultMetadata) => Promise<Vault>;
}
```

**Usage:**
```typescript
const { seals, createSeal, unsealVault } = useSealContext();
```

---

## 9) Testing Strategy

### 9.1 Unit Tests

**Crypto primitives:**
- AES-GCM encryption/decryption
- ECDH key agreement
- HKDF key derivation
- SHA-256 hashing

**Serialization:**
- SEAL binary format
- Metadata JSON encoding
- Vault ID computation

**Validation:**
- PoA transaction validation
- Amount condition checking
- Timelock verification

### 9.2 Integration Tests

**End-to-end flows:**
- seal() → bind() → unseal()
- rebind() → unseal()
- Import/export round-trip

**Error cases:**
- Invalid PoA transactions
- Unlock limit exceeded
- RBF transactions rejected

### 9.3 Test Vectors

**Provided in spec:**
- Known SEAL files with expected hashes
- Known metadata with expected encrypted bytes
- Known Vault IDs with inputs

---

**End of Architecture Document**

