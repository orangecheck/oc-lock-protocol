# LOCK Protocol Implementation Plan

## Goals: Usable, Coherent, Comprehensible, Intuitive

### What Makes LOCK Actually Usable?

**User Mental Model:**
```
1. "I want to encrypt a message for someone"
   → Create SEAL, specify recipient's Bitcoin address
   → System handles key derivation automatically
   → Get shareable .vault file

2. "I want to receive an encrypted message"
   → Import .vault file
   → System derives keys from my Bitcoin wallet
   → See encrypted message (locked)

3. "I want to unlock the message"
   → Click "Unlock"
   → System shows: "Send X sats to Y address"
   → I send transaction
   → System detects transaction, validates, unlocks
   → See decrypted message

4. "I want to transfer access to someone else"
   → Click "Transfer"
   → Enter new recipient's address
   → System creates new binding transaction
   → Share new .vault file with new recipient
```

**Key Insight:** User never sees "keys", "ECDH", "HKDF". System handles crypto automatically using Bitcoin wallet.

---

## Critical UX Principles

### 1. Bitcoin Wallet is the Key Source

**User has:** Bitcoin wallet (Sparrow, Electrum, hardware wallet)

**System derives:**
- Encryption keys from wallet's public key
- Decryption keys from wallet's private key (via signing)

**User never:**
- Generates random keys
- Manages key files
- Copies/pastes keys

### 2. One File Format: .vault

**NOT:**
- `.seal` file (just encrypted data)
- Separate metadata file
- Separate txid reference

**YES:**
- `.vault` file contains EVERYTHING needed:
  - SEAL (encrypted payload)
  - Encrypted metadata (rules)
  - Binding txid
  - Creator's ephemeral pubkey
  - Vault ID

**User flow:**
```
Create → Download message.vault
Share → Send message.vault to recipient
Import → Upload message.vault
Unlock → Send Bitcoin transaction
```

### 3. Clear State Visualization

**Vault States:**
```
┌─────────────────────────────────────────────────────┐
│ CREATED (no binding yet)                            │
│ ○ SEAL created                                      │
│ ○ Rules defined                                     │
│ ✗ Not bound to Bitcoin                             │
│ → Action: "Bind to Bitcoin" (create binding TX)    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ BINDING (transaction pending)                       │
│ ✓ SEAL created                                      │
│ ✓ Rules defined                                     │
│ ⏳ Binding transaction: 0/1 confirmations          │
│ → Action: Wait for confirmation                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ LOCKED (bound, awaiting PoA)                        │
│ ✓ SEAL created                                      │
│ ✓ Rules defined                                     │
│ ✓ Bound to Bitcoin (txid: abc123...)               │
│ ✗ No valid PoA transaction                         │
│ → Action: "Unlock" (create PoA transaction)        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ UNLOCKING (PoA transaction pending)                 │
│ ✓ SEAL created                                      │
│ ✓ Rules defined                                     │
│ ✓ Bound to Bitcoin                                  │
│ ⏳ PoA transaction: 0/1 confirmations               │
│ → Action: Wait for confirmation                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ UNLOCKED (PoA validated, decrypted)                 │
│ ✓ SEAL created                                      │
│ ✓ Rules defined                                     │
│ ✓ Bound to Bitcoin                                  │
│ ✓ PoA transaction confirmed                         │
│ ✓ Payload decrypted                                 │
│ → Action: View content                              │
└─────────────────────────────────────────────────────┘
```

### 4. Progressive Disclosure

**Simple Mode (default):**
```
Create Message
├─ Recipient: [Bitcoin address]
├─ Message: [text area]
└─ [Create & Bind]
```

**Advanced Mode (optional):**
```
Create Message
├─ Recipient: [Bitcoin address]
├─ Message: [text area]
├─ ⚙️ Advanced Rules
│   ├─ Amount: [10000 sats] (how much to unlock)
│   ├─ Recipient: [self / specific address]
│   ├─ Time Lock: [block height]
│   └─ Unlock Limit: [number]
└─ [Create & Bind]
```

---

## Implementation Architecture

### Core Data Flow

```
┌──────────────────────────────────────────────────────────┐
│                    USER CREATES VAULT                     │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 1. User Input                                            │
│    - Payload (message/file)                              │
│    - Recipient Bitcoin address                           │
│    - Rules (amount, timelock, etc.)                      │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 2. Key Derivation (ECDH + HKDF)                          │
│    - Generate ephemeral keypair                          │
│    - ECDH(ephemeralPriv, recipientPub) → sharedSecret    │
│    - HKDF(sharedSecret) → { sealKey, metadataKey }       │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 3. Encryption                                            │
│    - Encrypt payload with sealKey → SEAL                 │
│    - Encrypt metadata with metadataKey → encryptedMeta   │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 4. Binding (Bitcoin Transaction)                         │
│    - Create PSBT (self-spend from creator's wallet)      │
│    - Sign with wallet                                    │
│    - Broadcast → txid                                    │
│    - Wait for confirmation                               │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 5. Vault Creation                                        │
│    - Compute vaultId = SHA256(SEAL || meta || txid)      │
│    - Create Vault object                                 │
│    - Save to storage                                     │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 6. Export                                                │
│    - Serialize VaultBundle                               │
│    - Download as .vault file                             │
│    - Share with recipient                                │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  RECIPIENT IMPORTS VAULT                  │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 1. Import .vault File                                    │
│    - Deserialize VaultBundle                             │
│    - Extract: SEAL, encryptedMeta, txid, creatorPubkey   │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 2. Key Derivation (Recipient Side)                       │
│    - Get recipient's private key from wallet             │
│    - ECDH(recipientPriv, creatorPub) → sharedSecret      │
│    - HKDF(sharedSecret) → { sealKey, metadataKey }       │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 3. Decrypt Metadata                                      │
│    - Decrypt encryptedMeta with metadataKey → metadata   │
│    - Parse rules (amount, timelock, etc.)                │
│    - Validate recipient is authorized                    │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 4. Compute Vault ID                                      │
│    - vaultId = SHA256(SEAL || encryptedMeta || txid)     │
│    - Verify matches expected ID                          │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 5. Save Vault                                            │
│    - Store in local database                             │
│    - Status: LOCKED (awaiting PoA)                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                   RECIPIENT UNLOCKS VAULT                 │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 1. Create PoA Transaction                                │
│    - Read rules from metadata                            │
│    - Create PSBT satisfying rules:                       │
│      • From: authorized wallet                           │
│      • To: recipient wallet (or self)                    │
│      • Amount: satisfies amount condition                │
│    - Sign with wallet                                    │
│    - Broadcast → poaTxid                                 │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 2. Wait for Confirmation                                 │
│    - Poll blockchain for confirmations                   │
│    - Status: UNLOCKING                                   │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 3. Validate PoA                                          │
│    - Fetch confirmed transaction                         │
│    - Validate all rules:                                 │
│      ✓ Confirmed (≥1 conf)                               │
│      ✓ Non-RBF                                           │
│      ✓ Wallet match                                      │
│      ✓ Amount match                                      │
│      ✓ Recipient match                                   │
│      ✓ Timelock satisfied                                │
│      ✓ Unlock limit OK                                   │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 4. Decrypt SEAL                                          │
│    - Decrypt SEAL with sealKey → payload                 │
│    - Verify integrity tag                                │
│    - Increment unlock counter                            │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│ 5. Display Content                                       │
│    - Status: UNLOCKED                                    │
│    - Show decrypted payload                              │
│    - Save decrypted payload (optional)                   │
└──────────────────────────────────────────────────────────┘
```

---

## File Structure Refactoring

### Current Structure (Confusing)
```
src/modules/lock/lib/lock/
├── seal.ts              ← Mixed: SEAL + Vault functions
├── vault.ts             ← Duplicate/unclear
├── vaultSerialization.ts
├── bind.ts
├── rebind.ts
├── poa.ts
└── keyDerivation.ts
```

### New Structure (Clear Separation)
```
src/modules/lock/lib/lock/
├── core/
│   ├── seal.ts          ← SEAL operations only
│   ├── metadata.ts      ← Metadata (Rules) operations
│   ├── vault.ts         ← Vault composition
│   └── vaultBundle.ts   ← Import/export format
├── crypto/
│   ├── encryption.ts    ← AES-GCM primitives
│   ├── keyDerivation.ts ← ECDH + HKDF
│   └── hashing.ts       ← SHA-256, Vault ID
├── bitcoin/
│   ├── bind.ts          ← Binding transactions
│   ├── rebind.ts        ← Rebinding transactions
│   ├── poa.ts           ← PoA transaction creation
│   └── validation/
│       ├── index.ts
│       ├── walletValidator.ts
│       ├── amountValidator.ts
│       ├── recipientValidator.ts
│       ├── timelockValidator.ts
│       ├── unlockLimitValidator.ts
│       ├── confirmationValidator.ts
│       └── rbfValidator.ts
├── serialization/
│   ├── sealFormat.ts    ← SEAL binary format
│   ├── vaultBundle.ts   ← VaultBundle format
│   └── base64.ts        ← Encoding utilities
├── types.ts
├── constants.ts
├── errors.ts
└── index.ts             ← Public API
```

---

## Naming Conventions

### Functions

**SEAL Operations:**
```typescript
// Create
createSeal(payload, recipientPubkey) → { seal, ephemeralPubkey, derivedKeys }

// Serialize
serializeSeal(seal) → Uint8Array
deserializeSeal(bytes) → SealFile

// Decrypt
unsealPayload(seal, sealKey) → Uint8Array

// Hash
hashSeal(seal) → Uint8Array
```

**Metadata (Rules) Operations:**
```typescript
// Create
createMetadata(config) → VaultMetadata

// Encrypt/Decrypt
encryptMetadata(metadata, metadataKey) → Uint8Array
decryptMetadata(encryptedMetadata, metadataKey) → VaultMetadata
```

**Vault Operations:**
```typescript
// Compose
composeVault(seal, metadata, encryptedMetadata, bindingTxid, creatorPubkey) → Vault

// ID
computeVaultId(sealBytes, encryptedMetadata, txid) → string

// Bundle (import/export)
exportVaultBundle(vault) → Uint8Array
importVaultBundle(bundleBytes, recipientWallet) → Vault
```

**Bitcoin Operations:**
```typescript
// Binding
createBindingTransaction(wallet, metadata) → { psbt, txid }
broadcastBindingTransaction(signedPsbt) → txid

// PoA
createPoATransaction(wallet, metadata) → { psbt, txid }
validatePoATransaction(tx, metadata, vaultId) → PoAValidationResult

// Rebinding
rebindVault(vault, newMetadata, newWallet) → { newVault, newTxid }
```

**Key Derivation:**
```typescript
// ECDH
deriveSharedSecret(privateKey, publicKey) → Uint8Array

// HKDF
deriveVaultKeys(sharedSecret, sealHash) → { sealKey, metadataKey }

// Complete flow
deriveKeysForCreator(recipientPubkey) → { ephemeralPubkey, sealKey, metadataKey }
deriveKeysForRecipient(creatorPubkey, recipientPrivkey, sealHash) → { sealKey, metadataKey }
```

### Variables

```typescript
// SEAL
seal: SealFile
sealBytes: Uint8Array
sealKey: Uint8Array
sealHash: Uint8Array

// Metadata (Rules)
metadata: VaultMetadata
encryptedMetadata: Uint8Array
metadataKey: Uint8Array

// Vault
vault: Vault
vaultId: string
vaultBundle: VaultBundle

// Bitcoin
bindingTxid: string
bindingTx: BitcoinTransaction
poaTxid: string
poaTx: BitcoinTransaction

// Keys
ephemeralPubkey: Uint8Array
ephemeralPrivkey: Uint8Array
recipientPubkey: Uint8Array
recipientPrivkey: Uint8Array
sharedSecret: Uint8Array
```

---

## Next Steps: Execution Order

### Phase 1: Core Types & Schemas ✅
1. Update `types.ts` with complete type definitions
2. Update schemas with VaultBundle
3. Add creatorPubkey to Vault type

### Phase 2: Crypto Layer
1. Fix `keyDerivation.ts` - complete ECDH + HKDF
2. Create `crypto/encryption.ts` - AES-GCM primitives
3. Create `crypto/hashing.ts` - SHA-256, Vault ID

### Phase 3: Core Layer
1. Rewrite `seal.ts` - SEAL operations only
2. Create `metadata.ts` - Rules operations
3. Rewrite `vault.ts` - Vault composition
4. Create `vaultBundle.ts` - Import/export

### Phase 4: Bitcoin Layer
1. Fix `bind.ts` - Binding transactions
2. Fix `poa.ts` - PoA creation
3. Create `validation/` - Modular validators
4. Fix `rebind.ts` - Rebinding

### Phase 5: UI Components
1. Rename `components/vault/` → `components/vaults/`
2. Update all component logic
3. Fix context (`useSealContext` → `useVaultContext`)
4. Update routes

### Phase 6: Testing & Documentation
1. Write unit tests for each module
2. Write integration tests for flows
3. Update all documentation
4. Create migration guide

---

**Ready to proceed with Phase 1?**

