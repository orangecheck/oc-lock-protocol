# LOCK Protocol Refactoring - Execution Plan

## Established Pattern (from ochk module)

```
src/modules/{module}/
├── components/          ← UI components organized by feature
│   ├── {feature}/      ← Feature-specific components
│   └── shared/         ← Shared/common components
├── context/            ← React contexts (use{Feature}Context.tsx)
├── hooks/              ← Custom React hooks
├── lib/                ← Core library code
│   ├── {protocol}/     ← Protocol implementation
│   ├── utils/          ← Utility functions
│   └── wallet/         ← Wallet integration
├── schemas/            ← Zod schemas for validation
└── types/              ← TypeScript type definitions
```

---

## New LOCK Module Structure

```
src/modules/lock/
├── components/
│   ├── vaults/                    ← Vault management UI
│   │   ├── VaultsList.tsx
│   │   ├── VaultItem.tsx
│   │   ├── VaultManager.tsx
│   │   ├── VaultImport.tsx
│   │   └── VaultUnlockFlow.tsx
│   ├── create/                    ← Vault creation flow
│   │   ├── CreateSealFlow.tsx
│   │   ├── CreatePayloadStep.tsx
│   │   ├── CreateRulesStep.tsx
│   │   └── CreateBindingStep.tsx
│   ├── messages/                  ← SealChat messaging
│   │   ├── MessagesManager.tsx
│   │   ├── ConversationThread.tsx
│   │   ├── MessageComposer.tsx
│   │   └── MessagesAdvancedOptions.tsx
│   └── shared/                    ← Shared LOCK components
│       ├── LockAppShell.tsx
│       ├── LockDemoToggle.tsx
│       ├── LockProviders.tsx
│       ├── BindingFlow.tsx
│       └── VaultTypeIcon.tsx
├── context/
│   ├── useVaultContext.tsx        ← Vault management state
│   ├── useLockDemoContext.tsx     ← Demo mode state
│   ├── useLockWalletContext.tsx   ← Wallet integration
│   └── useSealFormDataContext.tsx ← Form state for creation
├── hooks/
│   ├── useVaultUnlock.ts          ← Unlock flow logic
│   ├── useVaultImport.ts          ← Import logic
│   ├── useVaultExport.ts          ← Export logic
│   └── usePoAValidation.ts        ← PoA validation
├── lib/
│   ├── lock-protocol/             ← LOCK protocol implementation
│   │   ├── seal.ts                ← SEAL operations
│   │   ├── metadata.ts            ← Metadata (Rules) operations
│   │   ├── vault.ts               ← Vault composition
│   │   ├── vaultBundle.ts         ← Import/export format
│   │   ├── keyDerivation.ts       ← ECDH + HKDF
│   │   ├── encryption.ts          ← AES-GCM primitives
│   │   ├── hashing.ts             ← SHA-256, Vault ID
│   │   ├── bind.ts                ← Binding transactions
│   │   ├── rebind.ts              ← Rebinding transactions
│   │   ├── poa.ts                 ← PoA transaction creation
│   │   ├── validation.ts          ← PoA validation
│   │   ├── serialization.ts       ← Binary formats
│   │   ├── constants.ts           ← Protocol constants
│   │   ├── errors.ts              ← Error classes
│   │   ├── types.ts               ← Type definitions
│   │   └── index.ts               ← Public API
│   ├── utils/                     ← Utility functions
│   │   ├── vaultStatus.ts         ← Vault status helpers
│   │   ├── vaultConversation.ts   ← SealChat helpers
│   │   └── vaultTypes.ts          ← Type guards
│   └── wallet/                    ← Wallet integration
│       ├── adapter.ts             ← Wallet adapter
│       └── psbt.ts                ← PSBT creation
├── schemas/                       ← Zod schemas
│   ├── vault-schema.ts            ← Vault & SEAL schemas
│   ├── metadata-schema.ts         ← Metadata schemas
│   ├── conditions-schema.ts       ← Amount conditions
│   ├── payload-schema.ts          ← Payload schemas
│   ├── seal-form-schema.ts        ← Form schemas
│   ├── import-schema.ts           ← Import schemas
│   ├── validation.ts              ← Validation utilities
│   └── index.ts                   ← Barrel export
└── types/                         ← TypeScript types
    └── types.ts                   ← Additional types
```

---

## Migration Strategy

### Step 1: Copy lock2 → lock (preserve structure)

```bash
# Copy entire lock2 directory to lock
cp -r src/modules/lock2/* src/modules/lock/

# Keep lock2 as backup during refactoring
# Delete lock2 only after lock is fully working
```

### Step 2: Reorganize lib/ directory

**Current (lock2):**
```
lib/lock/
├── seal.ts              ← Mixed functions
├── vault.ts             ← Duplicate
├── bind.ts
├── rebind.ts
├── poa.ts
├── keyDerivation.ts
└── ...
```

**New (lock):**
```
lib/lock-protocol/       ← Rename lock → lock-protocol
├── seal.ts              ← SEAL only
├── metadata.ts          ← NEW: Metadata operations
├── vault.ts             ← Vault composition
├── vaultBundle.ts       ← NEW: Import/export
├── keyDerivation.ts     ← ECDH + HKDF
├── encryption.ts        ← NEW: AES-GCM primitives
├── hashing.ts           ← NEW: SHA-256, Vault ID
├── bind.ts              ← Binding
├── rebind.ts            ← Rebinding
├── poa.ts               ← PoA creation
├── validation.ts        ← NEW: PoA validation
├── serialization.ts     ← Binary formats
├── constants.ts
├── errors.ts
├── types.ts
└── index.ts
```

### Step 3: Refactor Core Files

#### seal.ts - SEAL Operations Only

```typescript
/**
 * LOCK Protocol - SEAL Operations
 * 
 * SEAL = Encrypted payload container (ciphertext + nonce + tag)
 * This file contains ONLY SEAL-level operations.
 */

import type { SealFile } from '@/modules/lock/schemas';
import { encryptAesGcm, decryptAesGcm } from './encryption';
import { sha256 } from './hashing';
import { serializeSeal, deserializeSeal } from './serialization';

/**
 * Create a SEAL from payload
 * 
 * @param payload - Data to encrypt
 * @param sealKey - 32-byte encryption key
 * @param options - Optional metadata hint
 * @returns SEAL file object
 */
export async function createSeal(
  payload: Uint8Array,
  sealKey: Uint8Array,
  options?: { metadataHint?: string }
): Promise<SealFile> {
  // Implementation
}

/**
 * Decrypt a SEAL
 * 
 * @param seal - SEAL file object
 * @param sealKey - 32-byte decryption key
 * @returns Decrypted payload
 */
export async function unsealPayload(
  seal: SealFile,
  sealKey: Uint8Array
): Promise<Uint8Array> {
  // Implementation
}

/**
 * Serialize SEAL to binary
 */
export function sealToBytes(seal: SealFile): Uint8Array {
  return serializeSeal(seal);
}

/**
 * Deserialize SEAL from binary
 */
export function bytesToSeal(bytes: Uint8Array): SealFile {
  return deserializeSeal(bytes);
}

/**
 * Hash a SEAL
 */
export async function hashSeal(seal: SealFile | Uint8Array): Promise<Uint8Array> {
  const bytes = seal instanceof Uint8Array ? seal : sealToBytes(seal);
  return sha256(bytes);
}
```

#### metadata.ts - NEW FILE

```typescript
/**
 * LOCK Protocol - Metadata (Rules) Operations
 * 
 * Metadata = Access rules (who, what, when, how many)
 * This file contains metadata creation and encryption.
 */

import type { VaultMetadata, EncryptedMetadata } from '@/modules/lock/schemas';
import { encryptAesGcm, decryptAesGcm } from './encryption';

/**
 * Create vault metadata (access rules)
 * 
 * @param config - Metadata configuration
 * @returns Vault metadata object
 */
export function createMetadata(config: {
  authorizedWallet: string | string[] | 'ANY';
  amountCondition: AmountCondition;
  recipientWallet?: string | 'self';
  timeLock?: number;
  unlockLimit?: number;
}): VaultMetadata {
  // Implementation
}

/**
 * Encrypt metadata
 * 
 * @param metadata - Metadata object
 * @param metadataKey - 32-byte encryption key
 * @returns Encrypted metadata bytes
 */
export async function encryptMetadata(
  metadata: VaultMetadata,
  metadataKey: Uint8Array
): Promise<Uint8Array> {
  // Implementation
}

/**
 * Decrypt metadata
 * 
 * @param encryptedMetadata - Encrypted metadata bytes
 * @param metadataKey - 32-byte decryption key
 * @returns Metadata object
 */
export async function decryptMetadata(
  encryptedMetadata: Uint8Array,
  metadataKey: Uint8Array
): Promise<VaultMetadata> {
  // Implementation
}
```

#### vault.ts - Vault Composition

```typescript
/**
 * LOCK Protocol - Vault Operations
 * 
 * Vault = SEAL + Metadata + Binding TXID
 * This file contains vault composition and ID generation.
 */

import type { Vault, SealFile, VaultMetadata } from '@/modules/lock/schemas';
import { sha256 } from './hashing';
import { sealToBytes } from './seal';

/**
 * Compute Vault ID
 * 
 * @param sealBytes - Serialized SEAL
 * @param encryptedMetadata - Encrypted metadata bytes
 * @param txid - Binding transaction ID
 * @returns Vault ID (64-char hex)
 */
export async function computeVaultId(
  sealBytes: Uint8Array,
  encryptedMetadata: Uint8Array,
  txid: string
): Promise<string> {
  // Implementation
}

/**
 * Compose a complete vault
 * 
 * @param seal - SEAL file
 * @param metadata - Vault metadata
 * @param encryptedMetadata - Encrypted metadata bytes
 * @param bindingTxid - Binding transaction ID
 * @param creatorPubkey - Creator's ephemeral public key
 * @returns Complete vault object
 */
export async function composeVault(
  seal: SealFile,
  metadata: VaultMetadata,
  encryptedMetadata: Uint8Array,
  bindingTxid: string,
  creatorPubkey: Uint8Array
): Promise<Vault> {
  // Implementation
}
```

#### vaultBundle.ts - NEW FILE

```typescript
/**
 * LOCK Protocol - Vault Bundle (Import/Export)
 * 
 * VaultBundle = Shareable format containing everything needed
 * This is what gets exported as .vault files
 */

import type { VaultBundle, Vault } from '@/modules/lock/schemas';
import { deriveKeysForRecipient } from './keyDerivation';
import { decryptMetadata } from './metadata';
import { computeVaultId } from './vault';

/**
 * Export vault as bundle
 * 
 * @param vault - Complete vault
 * @returns Vault bundle (for .vault file)
 */
export function exportVaultBundle(vault: Vault): VaultBundle {
  // Implementation
}

/**
 * Import vault from bundle
 * 
 * @param bundle - Vault bundle
 * @param recipientPrivkey - Recipient's private key
 * @returns Complete vault
 */
export async function importVaultBundle(
  bundle: VaultBundle,
  recipientPrivkey: Uint8Array
): Promise<Vault> {
  // Implementation
}

/**
 * Serialize bundle to binary (.vault file)
 */
export function serializeVaultBundle(bundle: VaultBundle): Uint8Array {
  // Implementation
}

/**
 * Deserialize bundle from binary
 */
export function deserializeVaultBundle(bytes: Uint8Array): VaultBundle {
  // Implementation
}
```

---

## Execution Order

### Phase 1: Setup ✅
1. Copy lock2 → lock
2. Keep lock2 as backup

### Phase 2: Reorganize lib/
1. Rename `lib/lock/` → `lib/lock-protocol/`
2. Create new files:
   - `metadata.ts`
   - `vaultBundle.ts`
   - `encryption.ts`
   - `hashing.ts`
   - `validation.ts`
3. Refactor existing files:
   - `seal.ts` - SEAL operations only
   - `vault.ts` - Vault composition
   - `keyDerivation.ts` - Complete ECDH + HKDF
   - `bind.ts` - Clean up
   - `poa.ts` - Clean up
4. Update `index.ts` - Public API

### Phase 3: Update Schemas
1. Add `creatorPubkey` to Vault schema ✅
2. Add VaultBundle schema ✅
3. Update exports ✅

### Phase 4: Update Components
1. Update imports to use new lib structure
2. Rename variables for clarity
3. Update UI copy

### Phase 5: Update Context
1. Update useVaultContext with new functions
2. Update useLockWalletContext for key derivation
3. Update useLockDemoContext

### Phase 6: Testing
1. Type check
2. Test vault creation flow
3. Test import/export
4. Test unlock flow
5. Test rebinding

---

## Ready to Execute?

**Start with Phase 1: Copy lock2 → lock**

Then proceed systematically through each phase.

