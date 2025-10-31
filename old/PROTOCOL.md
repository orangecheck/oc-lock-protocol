# LOCK Protocol v1.0 — Product Flow & Integration Guide

**Profile:** `lock-v1-taproot-adaptor`  
**Audience:** Product managers, UX designers, integration engineers

---

## 1. Product Overview

### 1.1 What is LOCK?

LOCK (Ledger-Originated Cryptographic Key) enables **cryptographically-enforced encryption** to a Bitcoin address, where decryption requires:

1. **On-chain proof of ownership:** Recipient must spend a Challenge UTXO with their Taproot private key
2. **Proof-of-Access (PoA):** Recipient must create a transaction meeting specific rules (amount, confirmations)

**Key benefit:** Sender encrypts once and never returns; recipient unlocks when ready, with cryptographic (not application-level) enforcement.

### 1.2 Use Cases

- **Conditional data release:** Unlock documents/keys only after payment proof
- **Escrow-free exchanges:** Atomic data-for-bitcoin swaps
- **Time-locked secrets:** Combine with PoA timelock for future revelation
- **Inheritance planning:** Encrypt data accessible only after specific on-chain events
- **Whistleblower drops:** Anonymous encrypted data with bitcoin-gated access

### 1.3 User Roles

- **Sender:** Creates vault, funds Challenge UTXO, distributes vault file
- **Recipient:** Receives vault file, creates PoA transaction, spends Challenge UTXO, decrypts payload

---

## 2. Sender Flow (One-Time Vault Creation)

### 2.1 Prerequisites

- Bitcoin wallet with Taproot support (for funding Challenge UTXO)
- Recipient's Taproot (P2TR) address
- Data to encrypt (file, message, key, etc.)

### 2.2 Step-by-Step Process

#### Step 1: Configure Vault Rules

**User inputs:**
- Recipient's Taproot address (Bech32m format)
- PoA amount (satoshis, minimum 546)
- Required confirmations (recommended: 6 for mainnet, 1 for testnet)
- Optional: Timelock (Unix timestamp; PoA must be mined after this time)
- Network (mainnet/testnet/signet/regtest)

**UX considerations:**
- Validate address format and network compatibility
- Show USD equivalent of PoA amount
- Explain confirmation tradeoff (security vs. speed)
- Timelock picker with human-readable dates

#### Step 2: Select Payload

**User inputs:**
- File upload (drag-and-drop or file picker)
- Or: Text message (with character count)
- Or: Paste JSON/key material

**UX considerations:**
- Show file size and estimated encryption time
- Support multiple file formats (auto-detect MIME type)
- Warn if payload > 10 MB (large vaults are unwieldy)

#### Step 3: Create Vault (Background Process)

**App actions:**
1. Generate vault ID and adaptor secret `k`
2. Create and broadcast Challenge UTXO transaction (330 sats to recipient address)
3. Wait for 1 confirmation (show progress: "Confirming Challenge UTXO...")
4. Generate adaptor pre-signature template
5. Encrypt payload and master key
6. Assemble vault JSON file
7. Securely erase secrets from memory

**UX considerations:**
- Show progress bar with stages: "Funding Challenge → Confirming → Encrypting → Finalizing"
- Estimated time: 10-60 minutes (depends on mempool)
- Allow background operation (don't block UI)

#### Step 4: Download and Share Vault

**App actions:**
- Generate vault filename: `lock-{vaultId-prefix}.json`
- Offer download (browser) or save (desktop)
- Optionally: Generate QR code for vault file (for air-gapped transfer)

**UX considerations:**
- Prominent "Download Vault" button
- Show vault file size
- Provide sharing instructions: "Send this file to the recipient via secure channel"
- Warn: "You cannot decrypt this vault; only the recipient can"
- Optionally: Encrypt vault file with password (defense-in-depth)

#### Step 5: Sender Complete

**App state:**
- Vault created and downloaded
- Challenge UTXO confirmed on-chain
- Sender has no further actions

**UX considerations:**
- Success message: "Vault created successfully"
- Show Challenge UTXO transaction ID (for verification)
- Explain: "The recipient can now unlock this vault by creating a PoA transaction"
- No "track vault" feature (sender has no visibility into unseal events)

---

## 3. Recipient Flow (Vault Unlocking)

### 3.1 Prerequisites

- Bitcoin wallet with Taproot support (browser, hardware, or air-gapped)
- Vault file (received from sender)
- Sufficient bitcoin to fund PoA transaction + fees

### 3.2 Step-by-Step Process

#### Step 1: Import Vault

**User inputs:**
- Upload vault JSON file
- Or: Scan QR code (air-gapped mode)
- Or: Paste vault JSON text

**App actions:**
1. Parse and validate vault structure
2. Check version compatibility
3. Verify network matches wallet
4. Confirm recipient address matches wallet address

**UX considerations:**
- Drag-and-drop vault file upload
- Show vault metadata: creation date, PoA amount, required confirmations
- Error handling: "This vault is for testnet, but your wallet is on mainnet"
- Error handling: "This vault is addressed to a different wallet"

#### Step 2: Review Vault Rules

**App displays:**
- Recipient address (yours)
- PoA amount required (in BTC and USD)
- Required confirmations
- Timelock (if any): "PoA must be mined after [date]"
- Network
- Payload size (encrypted)

**UX considerations:**
- Clear summary card with all rules
- Highlight: "You must send [amount] BTC to yourself to unlock this vault"
- Explain: "This is a proof-of-access; you retain the bitcoin"
- Show estimated total cost: PoA amount + Challenge spend fee + transaction fees

#### Step 3: Create PoA Transaction

**User actions:**
- Click "Create PoA Transaction"
- Wallet prompts to send [amount] to [your address]

**App actions:**
1. Construct PoA transaction (output to recipient address with exact amount)
2. Add change output (if applicable)
3. Sign and broadcast transaction
4. Monitor for confirmations

**UX considerations:**
- Pre-fill transaction details in wallet
- Show confirmation progress: "0 / 6 confirmations"
- Estimated time to required confirmations
- Allow user to continue later (save progress)

**Wallet integration:**
- **Browser wallets:** Use `window.unisat.sendBitcoin()` or equivalent
- **Hardware wallets:** Generate PSBT, export via QR/USB, import signed PSBT
- **Air-gapped:** Display unsigned PSBT as QR code, scan signed PSBT back

#### Step 4: Wait for PoA Confirmations

**App actions:**
1. Poll blockchain for PoA transaction confirmations
2. Fetch block header containing PoA transaction
3. Extract merkle root
4. Validate PoA output matches vault rules

**UX considerations:**
- Live confirmation counter: "3 / 6 confirmations (estimated 30 minutes remaining)"
- Show PoA transaction ID (clickable link to block explorer)
- Handle reorgs: "Blockchain reorganization detected; revalidating..."
- Allow user to close app and return later (persist state)

#### Step 5: Spend Challenge UTXO

**User actions:**
- Click "Unlock Vault" (enabled after PoA confirmations met)
- Wallet prompts to sign Challenge spend transaction

**App actions:**
1. Load Challenge UTXO details from vault
2. Construct PSBT spending Challenge UTXO to recipient (or fee-only)
3. Wallet signs PSBT (standard Taproot key-path)
4. Finalize and broadcast transaction
5. Wait for 1 confirmation

**UX considerations:**
- Explain: "Signing this transaction will unlock the vault"
- Show Challenge UTXO value (330 sats) and fee
- Progress: "Broadcasting Challenge spend → Confirming → Extracting secret"

**Wallet integration:**
- **Browser wallets:** Use `window.unisat.signPsbt()` or equivalent
- **Hardware wallets:** Export PSBT via QR/USB, import signed PSBT
- **Air-gapped:** Display PSBT as QR code, scan signed PSBT back

#### Step 6: Extract Adaptor Secret and Decrypt

**App actions:**
1. Extract final signature from confirmed Challenge spend transaction
2. Compute adaptor secret `k` from pre-signature and final signature
3. Verify `k` matches adaptor commitment `T`
4. Derive final unseal key from `k` and PoA merkle root
5. Decrypt master key
6. Decrypt payload
7. Securely erase secrets from memory

**UX considerations:**
- Progress: "Extracting secret → Decrypting → Verifying"
- Estimated time: < 1 second (all local computation)
- Handle errors gracefully: "Decryption failed; vault may be corrupted"

#### Step 7: Access Decrypted Payload

**App displays:**
- Decrypted payload (text, file download, or preview)
- Success message: "Vault unlocked successfully"
- Metadata: original filename, MIME type, creation date

**UX considerations:**
- Prominent "Download Decrypted File" button
- For text payloads: show in-app with copy button
- For large files: stream to disk (don't load into memory)
- Warn: "This data is now unencrypted; handle securely"
- Optionally: Re-encrypt with user password for local storage

---

## 4. Wallet Integration Patterns

### 4.1 Browser Wallets (Unisat, Xverse, Leather)

**Capabilities:**
- Taproot address generation
- PSBT signing (key-path)
- Transaction broadcasting

**Integration:**
```javascript
// Connect wallet
const address = await window.unisat.requestAccounts();

// Create PoA transaction
const poaTxid = await window.unisat.sendBitcoin(
  recipientAddress,
  poaAmountSats
);

// Sign Challenge spend PSBT
const psbtHex = createChallengePsbt(vault);
const signedPsbtHex = await window.unisat.signPsbt(psbtHex);
const finalTx = finalizePsbt(signedPsbtHex);
```

**UX:**
- Wallet popup for each signature
- User confirms transaction details in wallet UI
- App polls for transaction confirmations

### 4.2 Hardware Wallets (Ledger, Trezor, Coldcard)

**Capabilities:**
- Taproot key-path signing via PSBT
- Air-gapped operation (QR codes, SD card, USB)

**Integration:**
```javascript
// Generate PSBT
const psbt = createChallengePsbt(vault);

// Export for hardware wallet
const qrCode = encodeUR(psbt); // UR encoding for QR
displayQR(qrCode);

// Import signed PSBT
const signedPsbt = await scanQR(); // or read from SD/USB
const finalTx = finalizePsbt(signedPsbt);
```

**UX:**
- Display animated QR code (for large PSBTs)
- Instructions: "Scan this QR with your hardware wallet"
- Support multiple import methods: QR, USB, SD card, file upload

### 4.3 Air-Gapped Workflows

**Scenario:** Fully offline signing device (e.g., Coldcard, DIY air-gapped laptop)

**Process:**
1. **Online device:** Generate PSBT, encode as QR code
2. **Air-gapped device:** Scan QR, sign PSBT, encode signed PSBT as QR
3. **Online device:** Scan signed PSBT QR, broadcast transaction

**UX:**
- Clear step-by-step instructions with diagrams
- Support UR (Uniform Resources) encoding for efficient QR codes
- Validate QR scan success before proceeding
- Fallback: Export PSBT as file (for SD card transfer)

---

## 5. Error Handling and Recovery

### 5.1 Common Errors

| Scenario | Error | Recovery |
|----------|-------|----------|
| Vault file corrupted | "Invalid vault format" | Re-download vault from sender |
| Wrong network | "Network mismatch" | Switch wallet to correct network |
| Wrong recipient | "Vault not addressed to this wallet" | Use correct wallet or contact sender |
| PoA insufficient confirmations | "Waiting for N more confirmations" | Wait for blockchain confirmations |
| PoA reorg | "Blockchain reorganization detected" | Wait for re-confirmation |
| Challenge UTXO already spent | "Challenge UTXO already consumed" | Vault already unlocked (check transaction history) |
| Wallet signature failure | "Wallet refused to sign" | Check wallet connection, retry |
| Decryption failure | "Decryption failed" | Vault may be corrupted or tampered; contact sender |

### 5.2 Reorg Handling

**Problem:** PoA transaction confirmed, then orphaned due to blockchain reorganization

**Detection:**
- Monitor PoA transaction confirmation count
- If count decreases, reorg detected

**Recovery:**
1. Alert user: "Blockchain reorganization detected; revalidating PoA"
2. Wait for PoA to re-confirm (may be in different block)
3. Re-fetch new block header and merkle root
4. Proceed with unseal using new merkle root

**UX:**
- Show reorg warning prominently
- Explain: "This is rare but normal; please wait for re-confirmation"
- Update confirmation counter in real-time

### 5.3 Partial Progress Persistence

**Problem:** User closes app mid-unseal (e.g., after PoA created but before Challenge spend)

**Solution:**
- Persist vault state in browser localStorage or app database
- Track progress: `{ vaultId, state: "poa_pending" | "poa_confirmed" | "challenge_pending" | "unlocked" }`
- On app restart, resume from last state

**UX:**
- "Resume Unlock" button for in-progress vaults
- Show progress: "PoA confirmed; ready to spend Challenge UTXO"

---

## 6. Privacy and Security Guidance

### 6.1 On-Chain Privacy

**What's visible on-chain:**
- Challenge UTXO: Standard P2TR output (330 sats to recipient)
- PoA transaction: Standard payment to recipient address
- Challenge spend: Standard P2TR key-path spend

**What's NOT visible:**
- Vault existence or contents
- Link between Challenge and PoA transactions (unless address reuse)
- Sender identity (unless Challenge funding transaction is traced)

**Best practices:**
- Use fresh addresses for each vault (avoid address reuse)
- Fund Challenge UTXO from mixed/coinjoined coins (if sender privacy critical)
- Recipient: Spend Challenge and PoA outputs separately (avoid linking)

### 6.2 Vault File Security

**Threat model:**
- Vault file contains encrypted payload (secure if encryption is sound)
- Vault file reveals: recipient address, PoA amount, Challenge UTXO location

**Best practices:**
- Transmit vault file over encrypted channel (Signal, PGP email, etc.)
- Optionally: Encrypt vault file with password (defense-in-depth)
- Store vault file securely (encrypted disk, password manager)
- Delete vault file after successful unseal (if no longer needed)

### 6.3 Sender Forward Secrecy

**Guarantee:** Sender cannot decrypt vault after creation

**Mechanism:** Adaptor secret `k` is securely erased after seal

**Implications:**
- Sender cannot track when/if vault is unlocked
- Sender cannot recover payload if vault file is lost
- Sender should keep backup of original payload (outside vault)

---

## 7. Operational Considerations

### 7.1 Fee Management

**Challenge UTXO funding:**
- Sender pays: 330 sats (dust) + transaction fee
- Typical cost: 500-1000 sats (< $1 at current prices)

**PoA transaction:**
- Recipient pays: PoA amount (returned to self) + transaction fee
- Typical fee: 1000-5000 sats depending on mempool

**Challenge spend:**
- Recipient pays: transaction fee (330 sats input is consumed)
- Typical fee: 500-1000 sats

**Total recipient cost:** ~1500-6000 sats (~$1-5) + temporary PoA amount lockup

### 7.2 Timelock Economics

**Use case:** Sender wants vault unlockable only after specific date

**Mechanism:** Set `poaTimeLock` to Unix timestamp; PoA block must be mined after this time

**Considerations:**
- Block timestamps are miner-reported (±2 hours tolerance)
- Use `poaTimeLock` for coarse-grained time locks (days/weeks, not minutes)
- For precise time locks, combine with Bitcoin timelocks (nLockTime, CLTV)

### 7.3 Dust Limits and UTXO Set Impact

**Challenge UTXO:**
- Minimum: 330 sats (P2TR dust limit)
- Adds 1 UTXO to global set (until spent)
- Spent during unseal (net-zero long-term impact)

**PoA UTXO:**
- Minimum: 546 sats (P2PKH/P2WPKH dust limit), 330 sats (P2TR)
- Recipient controls spending (may consolidate later)

**Best practices:**
- Use minimum dust amounts for Challenge UTXO (reduces sender cost)
- Recipient: Consolidate PoA and Challenge outputs during low-fee periods

---

## 8. Future Extensions

### 8.1 Multi-Recipient Vaults

**Concept:** Encrypt to multiple recipients (threshold or independent)

**Approach:**
- Threshold: Use Taproot script-path with MuSig2 or FROST
- Independent: Create separate Challenge UTXOs per recipient

### 8.2 Revocable Vaults

**Concept:** Sender can revoke vault before recipient unlocks

**Approach:**
- Sender retains ability to spend Challenge UTXO (2-of-2 multisig or timelock fallback)
- Requires script-path (loses indistinguishability)

### 8.3 Proof of Unseal

**Concept:** Recipient proves they unlocked vault without revealing payload

**Approach:**
- Zero-knowledge proof of decryption (zk-SNARK)
- Publish Challenge spend transaction (public proof of unlock)

---

## 9. Interoperability

### 9.1 Vault File Format

**Standard:** JSON (UTF-8)

**Versioning:** `version` field enables future protocol upgrades

**Compatibility:** Unknown versions must be rejected with clear error

### 9.2 Cross-Implementation Testing

**Goal:** Vaults created by implementation A can be unsealed by implementation B

**Requirements:**
- Identical KDF labels and parameters
- Identical AEAD AAD construction
- Identical output commitment computation
- Identical adaptor extraction algorithm

**Test vectors:** See `TESTPLAN.md`

---

## 10. Support and Troubleshooting

### 10.1 User Support Checklist

- [ ] Vault file intact and uncorrupted
- [ ] Wallet on correct network (mainnet/testnet)
- [ ] Wallet address matches vault recipient address
- [ ] PoA transaction confirmed with required confirmations
- [ ] PoA output matches vault rules (amount, address)
- [ ] Challenge UTXO not already spent
- [ ] Wallet supports Taproot key-path signing
- [ ] No blockchain reorg in progress

### 10.2 Debug Information

**For support requests, collect:**
- Vault version and vaultId
- Network (mainnet/testnet)
- PoA transaction ID and confirmation count
- Challenge UTXO transaction ID and spent status
- Error message and stack trace
- Wallet type and version

**Do NOT collect:**
- Private keys
- Decrypted payload
- Adaptor secret `k`

---

**End of Protocol Flow Guide**

