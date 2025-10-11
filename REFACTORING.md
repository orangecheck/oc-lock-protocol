# LOCK Protocol Refactoring Plan

This document outlines the systematic refactoring needed to align the codebase with the clean SEAL/Vault terminology and architecture defined in the protocol specification.

---

## Current State Analysis

### Terminology Confusion

**Problem:** "Vault" and "SEAL" were used interchangeably, causing confusion.

**Current issues:**
1. Files named `vault.ts` contain SEAL-level functions
2. Functions named `createVault()` actually create SEALs
3. UI copy mixes "Vault" and "SEAL" inconsistently
4. No clear separation between SEAL (encrypted blob) and Vault (SEAL + Rules + Bind)

### What We Have Now

**File structure:**
```
src/modules/lock/lib/lock/
  ├── seal.ts              ← Mixed: SEAL + Vault functions
  ├── vault.ts             ← Exists but shouldn't (duplicate)
  ├── vaultSerialization.ts ← Should be sealSerialization.ts
  ├── bind.ts              ← Correct
  ├── rebind.ts            ← Correct
  ├── poa.ts               ← Correct
  └── ...

src/modules/lock/components/
  ├── vault/               ← Should be seal/
  ├── create/
  │   └── CreateVaultFlow.tsx ← Should be CreateSealFlow.tsx
  └── ...

src/modules/lock/context/
  └── useVaultContext.tsx  ← Should be useSealContext.tsx

src/modules/lock/schemas/
  └── vault-schema.ts      ← Mixed: has both SEAL and Vault schemas
```

---

## Terminology Standard (Final)

### Core Terms

| Term | Definition | File Extension | Variable Prefix |
|------|------------|----------------|-----------------|
| **SEAL** | Encrypted payload container (ciphertext + nonce + tag) | `.seal` | `seal` |
| **Rules** | Encrypted metadata (access conditions) | N/A | `metadata` |
| **Bind** | On-chain transaction anchoring vault | N/A | `txid` |
| **Vault** | Complete structure: SEAL + Rules + Bind | N/A | `vault` |

### When to Use Each Term

**SEAL:**
- Creating encrypted payload: `createSeal()`
- Serializing to binary: `sealToBytes()`
- Deserializing from binary: `bytesToSeal()`
- File operations: `importSealFromFile()`, `exportSealToFile()`
- UI: "Import SEAL", "Export SEAL", "SEAL file"

**Vault:**
- Complete structure with metadata: `createVault()`
- Vault ID generation: `generateVaultId()`
- Storage operations: `saveVault()`, `loadVault()`
- UI: "My Vaults", "Vault Manager", "Vault Details"

**Rules (Metadata):**
- Creating access policy: `createSealMetadata()` (note: creates metadata FOR a seal)
- Encrypting policy: `encryptMetadata()`
- Decrypting policy: `decryptMetadata()`
- UI: "Access Rules", "Set Rules", "Edit Rules"

**Bind:**
- Anchoring to chain: `createBindingPsbt()`, `bind()`
- Transaction reference: `bindingTxid`
- UI: "Bind to Bitcoin", "Binding Transaction", "Anchor"

---

## Refactoring Plan

### Phase 1: Clean Protocol Specification ✅

**Status:** COMPLETE

**Deliverables:**
- ✅ `docs/oc-lock/README.md` — User-facing overview
- ✅ `docs/oc-lock/SPEC.md` — Normative specification
- ✅ `docs/oc-lock/PROTOCOL.md` — Design rationale
- ✅ `docs/oc-lock/ARCHITECTURE.md` — Implementation guide

### Phase 2: Core Library Refactoring

**Goal:** Align `src/modules/lock/lib/lock/` with spec terminology.

#### 2.1 File Reorganization

**Rename files:**
```bash
# Already done:
vault.ts → seal.ts (partially - needs cleanup)
vaultSerialization.ts → sealSerialization.ts

# Still needed:
# (None - files are correctly named)
```

**Clean up seal.ts:**
```typescript
// seal.ts should contain ONLY:
export async function createSeal(...)      // Create SEAL from payload
export function sealToBytes(...)           // Serialize SEAL
export function bytesToSeal(...)           // Deserialize SEAL
export async function unsealPayload(...)   // Decrypt SEAL
export async function hashSeal(...)        // Hash SEAL
export function validateSealFormat(...)    // Validate SEAL structure

// MOVE to vault.ts:
export function createSealMetadata(...)    // Create metadata (Rules)
export async function encryptMetadata(...) // Encrypt Rules
export async function decryptMetadata(...) // Decrypt Rules
export async function generateVaultId(...) // Compute Vault ID
export function bindMetadata(...)          // Add txid to metadata
export async function createVault(...)     // Create complete Vault
```

**Create clean vault.ts:**
```typescript
// vault.ts should contain:
export function createSealMetadata(...)    // Create Rules
export async function encryptMetadata(...) // Encrypt Rules
export async function decryptMetadata(...) // Decrypt Rules
export async function generateVaultId(...) // Compute Vault ID
export function bindMetadata(...)          // Add txid to metadata
export async function createVault(...)     // SEAL + Rules + Bind → Vault
```

#### 2.2 Function Naming

**Current → Correct:**
```typescript
// seal.ts
createSeal() ✅           // Already correct
sealToBytes() ✅         // Already correct
bytesToSeal() ✅         // Already correct
unsealPayload() ✅       // Already correct

// vault.ts (to be created/cleaned)
createVaultMetadata() → createSealMetadata()  // Creates metadata FOR a seal
createVault() ✅         // Already correct (creates complete Vault)
generateVaultId() ✅     // Already correct
```

#### 2.3 Type Definitions

**schemas/vault-schema.ts:**
```typescript
// Keep both SEAL and Vault schemas here (they're related)
export const sealFileSchema = z.object({...});
export const vaultSchema = z.object({...});

export type SealFile = z.infer<typeof sealFileSchema>;
export type Vault = z.infer<typeof vaultSchema>;
```

**schemas/metadata-schema.ts:**
```typescript
// Rename to make clear it's for Vaults
export const vaultMetadataSchema = z.object({...}); ✅
export type VaultMetadata = z.infer<typeof vaultMetadataSchema>; ✅
```

### Phase 3: Component Refactoring

**Goal:** Align UI components with terminology.

#### 3.1 Directory Structure

**Rename directories:**
```bash
src/modules/lock/components/vault/ → src/modules/lock/components/seal/
```

**Component files:**
```bash
# In seal/ directory:
VaultImport.tsx → SealImport.tsx
VaultItem.tsx → SealItem.tsx
VaultsList.tsx → SealsList.tsx
VaultManager.tsx → SealManager.tsx
VaultUnlockFlow.tsx → SealUnlockFlow.tsx

# In create/ directory:
CreateVaultFlow.tsx → CreateSealFlow.tsx

# In shared/ directory:
VaultTypeIcon.tsx → SealTypeIcon.tsx
```

#### 3.2 Context Refactoring

**Rename context:**
```bash
useVaultContext.tsx → useSealContext.tsx
```

**Context interface:**
```typescript
interface SealContextValue {
  // Vault management (note: managing Vaults, not SEALs)
  vaults: VaultWithMetadata[];        // Complete vaults
  
  // SEAL operations
  createSeal: (...) => Promise<Vault>;  // Creates SEAL + Vault
  importSeal: (...) => Promise<Vault>;  // Imports SEAL, creates Vault
  exportSeal: (vaultId) => void;        // Exports SEAL file
  
  // Vault operations
  unsealVault: (...) => Promise<Uint8Array>;  // Unseal using PoA
  rebindVault: (...) => Promise<Vault>;       // Rebind to new wallet
  deleteVault: (vaultId) => void;             // Delete vault
}
```

**Naming rationale:**
- Context is `SealContext` because it manages SEAL-related operations
- But it stores `vaults` (complete structures) not just SEALs
- Operations are named by what they do: `createSeal`, `unsealVault`, etc.

#### 3.3 UI Copy Updates

**Before → After:**
```
"Import Vault" → "Import SEAL"
"Export Vault" → "Export SEAL"
"Create Vault" → "Create SEAL"
"Vault File" → "SEAL File"
"My Vaults" → "My Vaults" ✅ (correct - managing complete vaults)
"Vault Details" → "Vault Details" ✅ (correct - viewing complete vault)
```

**Rule:** Use "SEAL" for file operations, "Vault" for management operations.

### Phase 4: Route Refactoring

**Goal:** Align routes with terminology.

#### 4.1 Route Structure

**Current:**
```
/lock/vaults          → Vault list
/lock/vaults/create   → Create vault
/lock/vaults/import   → Import vault
/lock/vaults/[id]     → Vault details
```

**Proposed (keep as-is):**
```
/lock/seals           → SEAL/Vault list (manages complete vaults)
/lock/seals/create    → Create SEAL (results in vault)
/lock/seals/import    → Import SEAL (creates vault)
/lock/seals/[id]      → Vault details (view complete vault)
```

**Rationale:** Routes use "seals" because the primary user action is working with SEAL files, but the underlying data structure is complete Vaults.

#### 4.2 Page Components

**Rename:**
```bash
src/pages/lock/vaults/ → src/pages/lock/seals/
src/pages/lock/vaults/[vaultId].tsx → src/pages/lock/seals/[sealId].tsx
```

**Note:** Parameter name `sealId` is actually a `vaultId` (the SHA-256 hash). This is acceptable because users think of it as "the ID of my SEAL" even though technically it's a Vault ID.

### Phase 5: Storage Refactoring

**Goal:** Update storage keys to match terminology.

#### 5.1 Storage Keys

**Current:**
```typescript
STORAGE_KEYS = {
  VAULTS: 'lock_vaults',
  UNLOCK_COUNTERS: 'lock_unlock_counters',
  // ...
}
```

**Keep as-is:** Storage keys should remain `lock_vaults` because:
1. We're storing complete Vaults (SEAL + metadata + txid)
2. Changing storage keys breaks existing users
3. "Vaults" is correct for what we're storing

#### 5.2 Demo Mode

**Current:**
```typescript
DEMO_MODE: 'lock_demo_mode'
```

**Keep as-is:** Demo mode is a global setting, not specific to SEALs or Vaults.

---

## Implementation Checklist

### Core Library

- [ ] Clean up `seal.ts` - move Vault functions to `vault.ts`
- [ ] Create clean `vault.ts` with Vault-specific functions
- [ ] Update `index.ts` exports to match new structure
- [ ] Verify all imports in `bind.ts`, `rebind.ts`, `poa.ts`
- [ ] Run type check: `npm run type-check`
- [ ] Run tests: `npm test`

### Components

- [ ] Rename `components/vault/` → `components/seal/`
- [ ] Rename all component files (Vault* → Seal*)
- [ ] Update all imports in components
- [ ] Rename `useVaultContext.tsx` → `useSealContext.tsx`
- [ ] Update context interface and implementation
- [ ] Update all UI copy (Import Vault → Import SEAL, etc.)

### Routes

- [ ] Rename `/pages/lock/vaults/` → `/pages/lock/seals/`
- [ ] Update route parameters (`vaultId` → `sealId`)
- [ ] Update navigation links in `LockAppShell.tsx`
- [ ] Update breadcrumbs and page titles

### Testing

- [ ] Run full type check: `npm run type-check`
- [ ] Test SEAL import flow
- [ ] Test SEAL export flow
- [ ] Test vault creation flow
- [ ] Test vault unsealing flow
- [ ] Test vault rebinding flow
- [ ] Verify demo mode works
- [ ] Verify real mode works

### Documentation

- [x] Create protocol specification docs
- [ ] Update inline code comments
- [ ] Update README.md in `src/modules/lock/`
- [ ] Create migration guide for existing users

---

## Migration Strategy

### For Existing Users

**Storage migration:**
```typescript
// On app load, check for old storage format
const oldVaults = localStorage.getItem('lock_vaults');
if (oldVaults) {
  // Parse and validate
  const vaults = JSON.parse(oldVaults);
  
  // No changes needed - storage format is same
  // Just terminology in UI changed
}
```

**No breaking changes:**
- Storage format unchanged
- File format unchanged (`.seal` files)
- API unchanged (same functions, just better organized)

### For Developers

**Import path changes:**
```typescript
// Before:
import { createVault } from '@/modules/lock/lib/lock/vault';

// After:
import { createSeal } from '@/modules/lock/lib/lock/seal';
import { createVault } from '@/modules/lock/lib/lock/vault';
```

**Component changes:**
```typescript
// Before:
import { VaultImport } from '@/modules/lock/components/vault/VaultImport';

// After:
import { SealImport } from '@/modules/lock/components/seal/SealImport';
```

---

## Success Criteria

### Code Quality

- ✅ All files use consistent terminology
- ✅ Clear separation: SEAL (encryption) vs Vault (complete structure)
- ✅ No confusion between "vault" and "seal" in code
- ✅ Type check passes with 0 errors
- ✅ All tests pass

### User Experience

- ✅ UI copy is clear and consistent
- ✅ Users understand difference between SEAL file and Vault
- ✅ Import/export flows use correct terminology
- ✅ No breaking changes for existing users

### Documentation

- ✅ Protocol spec is normative and complete
- ✅ Architecture doc explains implementation
- ✅ Code comments match spec terminology
- ✅ Migration guide available

---

## Timeline

**Phase 1:** ✅ COMPLETE (Protocol specification)
**Phase 2:** 2-3 hours (Core library refactoring)
**Phase 3:** 2-3 hours (Component refactoring)
**Phase 4:** 1 hour (Route refactoring)
**Phase 5:** 30 minutes (Storage verification)

**Total estimated time:** 6-8 hours

---

## Next Steps

1. **Review this plan** with user for approval
2. **Start Phase 2** - Core library refactoring
3. **Test incrementally** - Type check after each file
4. **Update components** - Phase 3
5. **Final testing** - End-to-end flows
6. **Deploy** - With migration guide

---

**Goal:** Clean, spec-aligned codebase with zero terminology confusion.

