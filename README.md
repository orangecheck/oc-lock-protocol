# LOCK Protocol - Documentation Index

**Version:** 1.0  
**Status:** Core Complete, Integration In Progress  
**Last Updated:** 2025-10-13

---

## Quick Links

- 📋 **[Project Status](./LOCK_PROJECT_STATUS.md)** - Current state, what's working, what's broken
- 🛠️ **[Implementation Plan](./IMPLEMENTATION_PLAN.md)** - Step-by-step guide to complete the app
- 🎨 **[UX Improvements](./UX_IMPROVEMENTS.md)** - Design enhancements and user experience polish
- 📖 **[Protocol Specification](./PROTOCOL.md)** - Technical protocol overview
- 📐 **[Technical Spec](./SPEC.md)** - Detailed cryptographic specification
- ✅ **[Unseal Flow Notes](./UNSEAL_FLOW_IMPLEMENTATION.md)** - Implementation notes for unsealing

---

## Executive Summary

### What is LOCK Protocol?

**LOCK** (Ledger-Originated Cryptographic Key) is a Bitcoin-enforced encryption protocol that enables secure data encryption to a Bitcoin address without requiring the recipient's public key or transaction history.

**Key Innovation:** Uses signature-based key derivation instead of ECDH, allowing encryption to ANY Bitcoin address (even unused ones).

### Current Status

✅ **Core Protocol:** Complete and tested (282 passing tests)  
✅ **Type Safety:** 0 TypeScript errors  
✅ **UI Components:** Built and styled  
❌ **Integration:** 3 critical gaps preventing end-to-end functionality

### Critical Gaps

1. **Wallet Signing** - Need to integrate challenge signing with wallet adapter
2. **Conversation Creation** - Need to wire up seal() to message sending
3. **Unseal Completion** - Need to connect all pieces for decryption

**Time to Fix:** 2-3 days of focused development

---

## Architecture Overview

### Technology Stack

```
Frontend:
- Next.js 15.5.4 (Pages Router)
- TypeScript 5
- Tailwind CSS 4
- shadcn/ui components
- bitcoin-wallet-adapter

Cryptography:
- Web Crypto API (AES-GCM, HKDF, SHA-256)
- BIP-322 message signing
- Custom LOCK protocol implementation

Bitcoin Integration:
- mempool.space API
- Proof-of-Access (PoA) transactions
- Merkle root entropy
```

### File Structure

```
src/modules/lock/
├── components/          # UI components (conversations, vault, wallet)
├── context/            # React contexts (wallet, vault, settings)
├── hooks/              # Custom hooks (transactions, derivation, alerts)
├── lib/
│   ├── lock/          # Core protocol (seal, unseal, crypto)
│   └── utils/         # Helpers (conversation, export, validation)
└── schemas/           # Zod validation schemas

src/pages/lock/
├── index.tsx          # Redirects to /conversations
└── conversations/
    ├── index.tsx      # Conversation list
    ├── [id].tsx       # Chat view
    ├── new.tsx        # Create conversation
    └── import.tsx     # Import vault

docs/oc-lock/
├── README.md                          # This file
├── LOCK_PROJECT_STATUS.md             # Detailed status analysis
├── IMPLEMENTATION_PLAN.md             # Step-by-step implementation guide
├── UX_IMPROVEMENTS.md                 # UX enhancements
├── PROTOCOL.md                        # Protocol overview
├── SPEC.md                            # Technical specification
└── UNSEAL_FLOW_IMPLEMENTATION.md      # Unseal flow notes
```

---

## Getting Started

### For Developers

1. **Read the Status Document:**
   ```bash
   open docs/oc-lock/LOCK_PROJECT_STATUS.md
   ```
   Understand what's working and what needs to be fixed.

2. **Review the Implementation Plan:**
   ```bash
   open docs/oc-lock/IMPLEMENTATION_PLAN.md
   ```
   Follow the step-by-step guide to complete the integration.

3. **Run Type Checks:**
   ```bash
   npm run type-check
   ```
   Should pass with 0 errors.

4. **Run Tests:**
   ```bash
   npm test
   ```
   All 282 tests should pass.

5. **Start Development:**
   ```bash
   npm run dev
   ```
   Navigate to http://localhost:3000/lock/conversations

### For Designers

1. **Review UX Improvements:**
   ```bash
   open docs/oc-lock/UX_IMPROVEMENTS.md
   ```
   See proposed design enhancements and user experience improvements.

2. **Check Current UI:**
   - Visit `/lock/conversations` for conversation list
   - Visit `/lock/conversations/new` for conversation creation
   - Check wallet connection flow
   - Review vault import (drag & drop)

### For Product Managers

1. **Understand the Protocol:**
   ```bash
   open docs/oc-lock/PROTOCOL.md
   ```
   Learn what LOCK does and why it's valuable.

2. **Review Project Status:**
   ```bash
   open docs/oc-lock/LOCK_PROJECT_STATUS.md
   ```
   See current progress and timeline to completion.

---

## Key Concepts

### Vault

An encrypted data container with embedded access requirements. Contains:
- Encrypted payload (conversation messages)
- PoA requirements (address, amount, confirmations)
- Cryptographic metadata (challenge, output commitment)

**File Format:** `.vault` (binary format, ~500 bytes + payload size)

### Proof-of-Access (PoA)

A Bitcoin transaction that proves the recipient meets access requirements:
- Sends exact amount to exact address
- Must have required confirmations
- Recipient creates this transaction themselves (self-spend)
- Only costs network fees (~10-50 sats)

### Sealing

The process of encrypting data into a vault:
1. Generate random vault ID
2. Compute output commitment (binds to PoA transaction)
3. Generate challenge (recipient must sign this)
4. Encrypt payload with master key
5. Encrypt master key with base key (derived from challenge)

### Unsealing

The process of decrypting a vault:
1. Create PoA transaction (prove address ownership)
2. Wait for confirmations
3. Sign challenge with private key
4. Derive unseal key (using signature + merkle root + output commitment)
5. Decrypt master key
6. Decrypt payload

---

## User Flows

### Creating a Conversation

```
1. User clicks "New Conversation"
2. Enters recipient Bitcoin address
3. Types message (optional: attach file)
4. Clicks "Send"
5. LOCK seals vault with message
6. .vault file downloads
7. User shares file with recipient
```

**Current Status:** ❌ Step 5-6 not implemented

### Receiving a Conversation

```
1. User receives .vault file
2. Drags file into LOCK app (or pastes data)
3. LOCK detects user is recipient
4. Unseal flow dialog appears
5. User creates PoA transaction
6. Waits for confirmation
7. LOCK automatically unseals vault
8. Messages display in conversation thread
```

**Current Status:** ⚠️ Steps 1-4 work, steps 5-8 partially implemented

### Replying to a Conversation

```
1. User opens unsealed conversation
2. Types reply message
3. Clicks "Send"
4. LOCK creates new vault with updated conversation
5. New .vault file downloads
6. User shares updated file with recipient
```

**Current Status:** ❌ Not implemented

---

## Testing Strategy

### Unit Tests (✅ Complete)

```bash
npm test
```

**Coverage:**
- ✅ Cryptographic primitives (34 tests)
- ✅ Seal/unseal operations (19 tests)
- ✅ Serialization (15 tests)
- ✅ Output commitments (35 tests)
- ✅ Challenge generation (10 tests)
- ✅ Integration tests (7 tests)

**Total:** 282 tests passing

### Integration Tests (❌ Needed)

**Manual Testing Checklist:**
- [ ] Create conversation with wallet connected
- [ ] Export vault file
- [ ] Import vault as recipient
- [ ] Create PoA transaction
- [ ] Wait for confirmation
- [ ] Unseal vault
- [ ] View decrypted messages
- [ ] Reply to conversation
- [ ] Test with demo mode
- [ ] Test error cases

### E2E Tests (❌ Needed)

**Playwright Tests to Write:**
- [ ] Complete conversation creation flow
- [ ] Complete unseal flow
- [ ] Wallet connection flow
- [ ] Error handling scenarios
- [ ] Mobile responsiveness

---

## Development Roadmap

### Phase 1: Make It Work (Week 1)
**Goal:** One complete end-to-end flow

- [ ] Implement wallet challenge signing
- [ ] Wire up conversation creation
- [ ] Complete unseal flow
- [ ] Test full cycle: create → export → import → unseal

**Deliverable:** Working prototype

### Phase 2: Make It Usable (Week 2)
**Goal:** Polish UX and add demo mode

- [ ] Integrate demo mode
- [ ] Improve PoA monitoring
- [ ] Add conversation replies
- [ ] Better error messages
- [ ] Loading states

**Deliverable:** Usable beta

### Phase 3: Make It Great (Week 3-4)
**Goal:** Production-ready polish

- [ ] Onboarding flow
- [ ] Vault management
- [ ] Mobile optimization
- [ ] Accessibility improvements
- [ ] E2E tests
- [ ] Documentation

**Deliverable:** Production release

---

## Common Issues & Solutions

### Issue: "Wallet signing not implemented"

**Solution:** See [Implementation Plan](./IMPLEMENTATION_PLAN.md) Task 1.1

### Issue: "Conversation creation doesn't work"

**Solution:** See [Implementation Plan](./IMPLEMENTATION_PLAN.md) Task 1.2

### Issue: "Unseal flow fails"

**Solution:** Check wallet connection, PoA transaction status, and signature implementation

### Issue: "Type errors"

**Solution:** Run `npm run type-check` - should be 0 errors. If not, check recent changes.

### Issue: "Tests failing"

**Solution:** Run `npm test` - all 282 tests should pass. Check for breaking changes.

---

## Contributing

### Code Style

- Use TypeScript strict mode
- Follow existing patterns in codebase
- Add JSDoc comments for public APIs
- Write tests for new features
- Run `npm run type-check` before committing

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes following [Implementation Plan](./IMPLEMENTATION_PLAN.md)
3. Add/update tests
4. Run type checks and tests
5. Update documentation
6. Submit PR with clear description

### Documentation

- Update relevant docs when changing features
- Add inline comments for complex logic
- Keep README files up to date
- Document breaking changes

---

## Resources

### External Documentation

- [Bitcoin Wallet Adapter](https://github.com/bitcoin-wallet-adapter/bitcoin-wallet-adapter)
- [mempool.space API](https://mempool.space/docs/api)
- [BIP-322 Specification](https://github.com/bitcoin/bips/blob/master/bip-0322.mediawiki)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

### Internal Documentation

- [OrangeCheck Protocol](../oc-protocol/PROTOCOL.md)
- [Project Structure](../../README.md)
- [Component Library](../../src/components/README.md)

---

## Support

### Getting Help

1. **Check Documentation:** Start with this README and linked docs
2. **Review Code:** Look at existing implementations for patterns
3. **Run Tests:** Tests show expected behavior
4. **Ask Questions:** Open GitHub issue or discussion

### Reporting Bugs

1. Check if issue already exists
2. Provide minimal reproduction
3. Include error messages and logs
4. Specify environment (browser, wallet, network)

---

## License

This project is part of the OrangeCheck ecosystem.

**Protocol Specification:** CC-BY-4.0  
**Implementation Code:** [Your License Here]

---

## Changelog

### 2025-10-13
- ✅ Fixed TypeScript syntax error in ConversationThread.tsx
- ✅ Created comprehensive documentation suite
- ✅ Analyzed project status and identified critical gaps
- ✅ Developed detailed implementation plan
- ✅ Documented UX improvements

### 2025-10-12
- ✅ Implemented unseal flow UI
- ✅ Added vault import functionality
- ✅ Created protocol documentation

### Earlier
- ✅ Implemented core LOCK protocol
- ✅ Built conversation UI components
- ✅ Integrated wallet connection
- ✅ Created test suite

---

## Next Steps

**Immediate Actions:**

1. **Read [LOCK_PROJECT_STATUS.md](./LOCK_PROJECT_STATUS.md)** to understand current state
2. **Follow [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** to complete integration
3. **Review [UX_IMPROVEMENTS.md](./UX_IMPROVEMENTS.md)** for design polish

**Priority Order:**

1. 🔴 Wallet signing integration (unblocks everything)
2. 🔴 Conversation creation flow
3. 🔴 Complete unseal flow
4. 🟡 Demo mode integration
5. 🟡 UX improvements

**Timeline:** 2-3 days for critical features, 1 week for complete polish

---

**Ready to start?** Begin with [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) Task 1.1! 🚀

