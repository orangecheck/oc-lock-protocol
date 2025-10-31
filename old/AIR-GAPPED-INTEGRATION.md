# Air-Gapped Workflow Integration Plan

## Overview

This document outlines the integration of air-gapped workflow components into the LOCK Protocol application.

## Current State

### ✅ Completed Components

1. **Workflow Orchestration Components** (`src/modules/lock/components/workflows/`)
   - `WorkflowSelector.tsx` - Mode selection (wallet vs air-gapped)
   - `AirGappedMethodSelector.tsx` - Method selection (QR vs file)
   - `WalletPath.tsx` - Wallet-connected signing flow
   - `AirGappedPath.tsx` - Air-gapped signing orchestration
   - `PoAValidator.tsx` - PoA confirmation monitoring
   - `LockWorkflowOrchestrator.tsx` - Complete workflow orchestration
   - `types.ts` - Comprehensive type definitions

2. **Existing Air-Gapped Components** (`src/modules/lock/components/wallet/`)
   - `AirGappedFileFlow.tsx` - File-based PSBT workflow
   - `AirGappedQRFlow.tsx` - QR code-based PSBT workflow

3. **Core LOCK Protocol**
   - v1.0 (Taproot Adaptor) - Fully implemented
   - v1.1 (Relay Release) - Fully implemented
   - Dual-mode support - Automatic selection based on wallet capabilities

## Integration Points

### 1. Vault Creation (Seal Flow)

**Current State**: No dedicated seal flow component exists. Vaults are created implicitly when:
- Creating a new conversation in LOCKCHAT
- Importing a vault file

**Required Integration**:
- Create `SealFlow.tsx` component that uses `LockWorkflowOrchestrator`
- Integrate Challenge UTXO funding workflow
- Support both wallet and air-gapped Challenge UTXO creation

**Transaction Type**: `challenge-utxo`
- Sender funds a P2TR output to recipient's address
- Amount: Configurable (default: 10,000 sats)
- Purpose: Recipient must spend this to prove address ownership

### 2. Vault Unsealing (Unseal Flow)

**Current State**: `UnsealFlow.tsx` exists but doesn't integrate air-gapped workflows

**Required Integration**:
- Integrate `LockWorkflowOrchestrator` into `UnsealFlow.tsx`
- Support PoA transaction creation (both wallet and air-gapped)
- Monitor PoA confirmations using `PoAValidator`
- Extract adaptor secret `k` after confirmation
- Decrypt vault payload

**Transaction Type**: `poa`
- Recipient creates transaction spending from their address
- Must include Challenge UTXO as input (v1.0) or any UTXO (v1.1)
- Signature reveals adaptor secret `k` (v1.0) or `k` published to Nostr (v1.1)

### 3. LOCKCHAT Message Sealing

**Current State**: Messages are stored locally without blockchain binding

**Required Integration**:
- Add optional "Seal & Send" flow to `MessageComposer`
- Each message can be sealed as a separate vault
- Challenge UTXO workflow for each sealed message
- Store vault metadata with conversation

**Note**: This is a future enhancement. Current priority is vault-level sealing.

## Implementation Phases

### Phase 1: Vault Unsealing (CURRENT PRIORITY)

**Goal**: Integrate air-gapped workflows into existing `UnsealFlow.tsx`

**Tasks**:
1. ✅ Create workflow orchestration components
2. ⏳ Integrate `LockWorkflowOrchestrator` into `UnsealFlow.tsx`
3. ⏳ Implement PoA transaction building
4. ⏳ Add PoA confirmation monitoring
5. ⏳ Test complete unseal flow (wallet + air-gapped)

**Files to Modify**:
- `src/modules/lock/components/vault/UnsealFlow.tsx`

### Phase 2: Vault Creation (Seal Flow)

**Goal**: Create dedicated seal flow with Challenge UTXO funding

**Tasks**:
1. ⏳ Create `SealFlow.tsx` component
2. ⏳ Implement Challenge UTXO transaction building
3. ⏳ Integrate `LockWorkflowOrchestrator`
4. ⏳ Add Challenge UTXO confirmation monitoring
5. ⏳ Store Challenge UTXO metadata with vault
6. ⏳ Test complete seal flow (wallet + air-gapped)

**Files to Create**:
- `src/modules/lock/components/vault/SealFlow.tsx`

### Phase 3: LOCKCHAT Integration

**Goal**: Add optional message-level sealing to LOCKCHAT

**Tasks**:
1. ⏳ Add "Seal Message" toggle to `MessageComposer`
2. ⏳ Integrate seal flow for individual messages
3. ⏳ Display sealed message status in `MessageList`
4. ⏳ Add unseal flow for individual messages
5. ⏳ Test complete LOCKCHAT seal/unseal cycle

**Files to Modify**:
- `src/modules/lock/components/conversations/MessageComposer.tsx`
- `src/modules/lock/components/conversations/MessageList.tsx`

## Technical Considerations

### PSBT Building

**Challenge UTXO Transaction**:
```typescript
// Sender creates P2TR output to recipient
const challengeUtxo = {
    address: recipientTaprootAddress,
    amount: 10000, // sats
    // Optional: Add timelock for auto-refund
};
```

**PoA Transaction**:
```typescript
// Recipient spends from their address
const poaTx = {
    inputs: [
        // v1.0: Must include Challenge UTXO
        // v1.1: Any UTXO from recipient address
    ],
    outputs: [
        // Change back to recipient
    ],
    // v1.0: Sign with adaptor signature
    // v1.1: Sign normally, publish k to Nostr
};
```

### Demo Mode Considerations

- All workflows must work in demo mode
- Demo mode should simulate blockchain interactions
- PSBT building should use mock data in demo mode
- PoA validation should simulate confirmations in demo mode

### Error Handling

- Wallet connection failures
- PSBT building errors
- Broadcast failures
- Confirmation timeout
- Invalid PoA transactions

### UX Patterns

- Consistent with OrangeCheck app patterns
- Clear progress indicators
- Informative error messages
- Graceful fallbacks
- Mobile-responsive design

## Testing Strategy

### Unit Tests

- Workflow orchestration logic
- PSBT building functions
- PoA validation logic
- Transaction broadcasting

### Integration Tests

- Complete seal flow (wallet mode)
- Complete seal flow (air-gapped QR)
- Complete seal flow (air-gapped file)
- Complete unseal flow (wallet mode)
- Complete unseal flow (air-gapped QR)
- Complete unseal flow (air-gapped file)

### E2E Tests

- Full vault lifecycle (seal → bind → unseal)
- LOCKCHAT message sealing
- Demo mode workflows
- Error recovery flows

## Success Criteria

### Phase 1 Complete When:
- ✅ Workflow components created and type-safe
- ⏳ UnsealFlow integrates LockWorkflowOrchestrator
- ⏳ PoA transactions can be created via wallet
- ⏳ PoA transactions can be created via air-gapped (QR + file)
- ⏳ PoA confirmations are monitored in real-time
- ⏳ Vaults can be unsealed after PoA confirmation
- ⏳ All tests pass
- ⏳ Demo mode works correctly

### Phase 2 Complete When:
- ⏳ SealFlow component created
- ⏳ Challenge UTXO can be funded via wallet
- ⏳ Challenge UTXO can be funded via air-gapped (QR + file)
- ⏳ Challenge UTXO confirmations are monitored
- ⏳ Vault metadata includes Challenge UTXO details
- ⏳ All tests pass
- ⏳ Demo mode works correctly

### Phase 3 Complete When:
- ⏳ Individual messages can be sealed
- ⏳ Sealed messages display correctly in chat
- ⏳ Sealed messages can be unsealed
- ⏳ Conversation-level and message-level sealing coexist
- ⏳ All tests pass
- ⏳ Demo mode works correctly

## Air-Gapped Solution Score

**Current Score**: 7/10 (up from 3/10)

**Improvements**:
- ✅ Complete workflow orchestration components
- ✅ Proper architecture and code organization
- ✅ Type-safe implementation
- ✅ PoA validation component
- ⏳ Integration into existing flows (in progress)

**Remaining Gaps**:
- ⏳ PSBT building for Challenge UTXO and PoA transactions
- ⏳ Integration testing
- ⏳ Demo mode support
- ⏳ Complete documentation

**Target Score**: 10/10 after all phases complete

