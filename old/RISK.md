# LOCK Protocol v1.0 — Risk Analysis and Limitations

**Profile:** `lock-v1-taproot-adaptor`  
**Purpose:** Comprehensive analysis of assumptions, limitations, attack vectors, and operational risks

---

## 1. Cryptographic Assumptions

### 1.1 Hardness Assumptions

**Discrete Logarithm Problem (DLP):**
- **Assumption:** Computing `k` from `T = k·G` is computationally infeasible
- **Impact:** If broken, adaptor secret can be extracted without Challenge spend
- **Mitigation:** secp256k1 is industry-standard; no known classical attacks
- **Quantum Risk:** Shor's algorithm breaks DLP; see section 8

**ECDSA/Schnorr Unforgeability:**
- **Assumption:** Cannot forge valid signature without private key
- **Impact:** If broken, attacker can spend Challenge UTXO without recipient's key
- **Mitigation:** BIP-340 Schnorr is provably secure in random oracle model
- **Quantum Risk:** Shor's algorithm breaks signature schemes; see section 8

**SHA-256 Preimage Resistance:**
- **Assumption:** Cannot find `x` such that `SHA256(x) = y` for given `y`
- **Impact:** If broken, output commitment can be forged
- **Mitigation:** SHA-256 has 256-bit security; no known preimage attacks
- **Quantum Risk:** Grover's algorithm reduces security to 128 bits (still acceptable)

**AES-256 Security:**
- **Assumption:** AES-256-GCM is semantically secure
- **Impact:** If broken, ciphertext can be decrypted without key
- **Mitigation:** AES-256 is NIST-approved; no known practical attacks
- **Quantum Risk:** Grover's algorithm reduces security to 128 bits (still acceptable)

### 1.2 Implementation Assumptions

**Secure Random Number Generation:**
- **Assumption:** CSPRNG provides unpredictable randomness
- **Risk:** Weak RNG → predictable `k`, `vaultId`, nonces → total break
- **Mitigation:** Use OS-provided CSPRNG (e.g., `/dev/urandom`, `crypto.getRandomValues()`)

**Constant-Time Cryptography:**
- **Assumption:** Implementations use constant-time operations
- **Risk:** Timing side-channels leak secret key bits
- **Mitigation:** Use audited libraries (libsecp256k1, OpenSSL, etc.)

**Secure Memory Handling:**
- **Assumption:** Secrets are zeroed after use
- **Risk:** Memory dumps or swap files leak secrets
- **Mitigation:** Use `sodium_memzero()` or equivalent; disable swap for sensitive processes

---

## 2. Blockchain Assumptions

### 2.1 Bitcoin Network Security

**Proof-of-Work Integrity:**
- **Assumption:** Bitcoin's PoW prevents block forgery
- **Impact:** If broken, attacker can forge PoA block with fake merkle root
- **Mitigation:** Require sufficient confirmations (6+ for mainnet)
- **Risk:** 51% attack can reorg chain; see section 2.3

**Transaction Finality:**
- **Assumption:** Transactions with 6+ confirmations are irreversible
- **Impact:** If PoA transaction is reversed, unseal may fail or use wrong merkle root
- **Mitigation:** Reorg detection and revalidation (see SPEC.md section 6.2)

### 2.2 UTXO Set Integrity

**Challenge UTXO Availability:**
- **Assumption:** Challenge UTXO remains unspent until recipient unseals
- **Risk:** Sender double-spends Challenge UTXO → vault becomes unusable
- **Mitigation:** Sender has no incentive (loses 330 sats); vault file is proof of malice
- **Limitation:** No cryptographic prevention; trust sender not to sabotage

**PoA Output Validation:**
- **Assumption:** Blockchain nodes correctly validate transactions
- **Impact:** If node is compromised, fake PoA transaction may be accepted
- **Mitigation:** Use multiple independent blockchain data sources

### 2.3 Reorganization Risk

**Shallow Reorgs (1-5 blocks):**
- **Frequency:** Occasional (few times per year on mainnet)
- **Impact:** PoA transaction temporarily unconfirmed; merkle root changes
- **Mitigation:** Require 6+ confirmations; revalidate on reorg detection

**Deep Reorgs (6+ blocks):**
- **Frequency:** Extremely rare (never on mainnet without 51% attack)
- **Impact:** PoA transaction may be permanently reversed
- **Mitigation:** User must recreate PoA transaction; vault remains valid

**51% Attack:**
- **Frequency:** Theoretical (economically irrational on mainnet)
- **Impact:** Attacker can reorg arbitrary depth, forge merkle roots
- **Mitigation:** None (protocol inherits Bitcoin's security model)

---

## 3. Wallet Integration Risks

### 3.1 Wallet Compatibility

**Taproot Support:**
- **Assumption:** Wallet supports Taproot key-path signing
- **Risk:** Older wallets (pre-2021) cannot unseal vaults
- **Mitigation:** Check wallet capabilities before vault creation; provide upgrade guidance

**PSBT Support:**
- **Assumption:** Wallet can sign PSBTs (BIP-174, BIP-371)
- **Risk:** Some wallets only support legacy transaction formats
- **Mitigation:** Test with target wallets; provide fallback instructions

**Signature Format:**
- **Assumption:** Wallet produces BIP-340 Schnorr signatures
- **Risk:** Non-standard signature format breaks adaptor extraction
- **Mitigation:** Validate signature format before extraction

### 3.2 Wallet Security

**Private Key Exposure:**
- **Risk:** Malicious wallet leaks private key to attacker
- **Impact:** Attacker can unseal vault (but cannot prevent legitimate unseal)
- **Mitigation:** Use reputable wallets; hardware wallets for high-value vaults

**Signature Malleability:**
- **Risk:** Wallet modifies signature after user approval
- **Impact:** Adaptor extraction may fail or extract wrong `k`
- **Mitigation:** BIP-340 Schnorr signatures are non-malleable

### 3.3 Air-Gapped Workflow Risks

**QR Code Scanning Errors:**
- **Risk:** QR code corruption or incomplete scan
- **Impact:** PSBT parsing fails; transaction cannot be signed
- **Mitigation:** Use error-correcting UR encoding; verify QR integrity

**Physical Security:**
- **Risk:** Attacker observes QR codes (camera, shoulder surfing)
- **Impact:** Attacker learns PSBT details (but not private keys)
- **Mitigation:** Perform air-gapped operations in secure environment

---

## 4. Economic and Operational Risks

### 4.1 Dust Economics

**Challenge UTXO Cost:**
- **Sender cost:** 330 sats + tx fee ≈ 500-1000 sats (~$0.50-$1)
- **Risk:** High fee environment makes vaults expensive
- **Mitigation:** Batch vault creation; wait for low-fee periods

**PoA Temporary Lockup:**
- **Recipient cost:** `poaAmountSats` locked until spent (opportunity cost)
- **Risk:** Large PoA amounts tie up capital
- **Mitigation:** Minimize PoA amount; spend PoA output immediately after unseal

**UTXO Set Bloat:**
- **Impact:** Each vault adds 1 UTXO (Challenge) until unsealed
- **Risk:** Large-scale vault creation bloats UTXO set
- **Mitigation:** Challenge UTXOs are spent during unseal (temporary impact)

### 4.2 Fee Market Volatility

**High Fee Periods:**
- **Risk:** Challenge spend or PoA transaction stuck in mempool
- **Impact:** Unseal delayed until fees drop or user pays higher fee
- **Mitigation:** Use RBF (Replace-By-Fee) for PoA and Challenge transactions

**Fee Estimation Errors:**
- **Risk:** Underpaid fees → transactions never confirm
- **Impact:** Vault unusable until transactions are re-broadcast with higher fees
- **Mitigation:** Use conservative fee estimation; allow fee bumping

### 4.3 Timelock Risks

**Block Timestamp Manipulation:**
- **Risk:** Miners can manipulate block timestamps (±2 hours)
- **Impact:** PoA may be mined slightly before/after intended timelock
- **Mitigation:** Use coarse-grained timelocks (days/weeks, not hours)

**Timelock Expiry:**
- **Risk:** Sender sets timelock far in future; recipient forgets about vault
- **Impact:** Vault remains sealed indefinitely
- **Mitigation:** Sender should communicate timelock clearly; recipient should set reminders

---

## 5. Privacy Risks

### 5.1 On-Chain Linkability

**Address Reuse:**
- **Risk:** Using same `recipientP2TR` for multiple vaults
- **Impact:** All vaults linkable to same recipient
- **Mitigation:** Use fresh address for each vault (HD wallet derivation)

**Challenge-PoA Linking:**
- **Risk:** Challenge and PoA transactions both to same address
- **Impact:** Observer can infer vault existence
- **Mitigation:** Use different addresses for Challenge and PoA (requires protocol modification)

**Timing Correlation:**
- **Risk:** Challenge UTXO created, then PoA created shortly after
- **Impact:** Observer can correlate transactions
- **Mitigation:** Delay PoA creation; use CoinJoin for PoA funding

### 5.2 Vault File Metadata Leakage

**Recipient Address Exposure:**
- **Risk:** Vault file reveals `recipientP2TR`
- **Impact:** Observer learns recipient identity (if address is known)
- **Mitigation:** Encrypt vault file with password; transmit over encrypted channel

**PoA Amount Exposure:**
- **Risk:** Vault file reveals `poaAmountSats`
- **Impact:** Observer learns economic value of vault
- **Mitigation:** Same as above

**Challenge UTXO Exposure:**
- **Risk:** Vault file reveals Challenge UTXO location
- **Impact:** Observer can monitor Challenge spend (unseal event)
- **Mitigation:** Same as above

### 5.3 Network-Level Privacy

**Blockchain Queries:**
- **Risk:** Querying blockchain for PoA/Challenge transactions leaks interest
- **Impact:** Network observer (ISP, blockchain API) learns vault activity
- **Mitigation:** Use Tor; run local Bitcoin node; query via VPN

**Transaction Broadcasting:**
- **Risk:** Broadcasting PoA/Challenge spend reveals IP address
- **Impact:** Network observer links IP to vault activity
- **Mitigation:** Broadcast via Tor; use third-party broadcast services

---

## 6. Denial-of-Service Risks

### 6.1 Sender-Side DoS

**Challenge UTXO Spam:**
- **Attack:** Sender creates many Challenge UTXOs without distributing vaults
- **Impact:** UTXO set bloat; wasted blockchain space
- **Mitigation:** Challenge UTXOs are small (330 sats); economic disincentive

**Vault File Spam:**
- **Attack:** Sender distributes many invalid vault files
- **Impact:** Recipient wastes time validating corrupted vaults
- **Mitigation:** Validate vault structure before attempting unseal

### 6.2 Recipient-Side DoS

**PoA Griefing:**
- **Attack:** Attacker creates PoA transaction but never spends Challenge UTXO
- **Impact:** Vault remains sealed; recipient wastes PoA amount
- **Mitigation:** Recipient controls both PoA and Challenge spend; no external griefing

**Mempool Congestion:**
- **Attack:** Network-wide high fee environment
- **Impact:** PoA/Challenge transactions delayed
- **Mitigation:** Wait for low-fee periods; use fee bumping

### 6.3 Network-Level DoS

**Blockchain API Overload:**
- **Attack:** Many users query same API for PoA/Challenge data
- **Impact:** API rate-limits or crashes
- **Mitigation:** Use multiple APIs; run local node; implement caching

---

## 7. Implementation Risks

### 7.1 Software Bugs

**Cryptographic Library Bugs:**
- **Risk:** Bug in secp256k1, AES, or HKDF implementation
- **Impact:** Vault encryption broken; secrets leaked
- **Mitigation:** Use well-audited libraries (libsecp256k1, OpenSSL, libsodium)

**Adaptor Extraction Bugs:**
- **Risk:** Incorrect adaptor secret extraction algorithm
- **Impact:** Unseal fails; vault unusable
- **Mitigation:** Comprehensive test vectors (see TESTPLAN.md)

**PSBT Handling Bugs:**
- **Risk:** Malformed PSBT parsing or generation
- **Impact:** Wallet refuses to sign; transaction invalid
- **Mitigation:** Use standard PSBT libraries; test with multiple wallets

### 7.2 Dependency Risks

**Supply Chain Attacks:**
- **Risk:** Malicious code in cryptographic dependencies
- **Impact:** Private keys stolen; vaults compromised
- **Mitigation:** Pin dependency versions; verify checksums; use SRI for web

**Unmaintained Dependencies:**
- **Risk:** Cryptographic library no longer maintained
- **Impact:** Security vulnerabilities unpatched
- **Mitigation:** Monitor dependency health; migrate to maintained alternatives

### 7.3 Platform Risks

**Browser Security:**
- **Risk:** Browser extension or malicious website steals secrets
- **Impact:** Private keys or decrypted payloads leaked
- **Mitigation:** Use Content Security Policy; isolate crypto operations in Web Workers

**Mobile Platform Security:**
- **Risk:** Mobile OS or app sandbox escape
- **Impact:** Secrets leaked to other apps
- **Mitigation:** Use platform keychain (iOS Keychain, Android Keystore)

---

## 8. Quantum Computing Risks

### 8.1 Threat Timeline

**Current Status (2024):**
- No quantum computer can break secp256k1 or AES-256
- Estimated timeline: 10-30 years until cryptographically-relevant quantum computers

**Impact on LOCK:**
- **Short-term vaults (< 5 years):** Low risk
- **Long-term vaults (> 10 years):** Moderate risk
- **Permanent secrets:** High risk (do not use LOCK for long-term secrets)

### 8.2 Attack Scenarios

**Shor's Algorithm (DLP and ECDSA):**
- **Impact:** Attacker can compute `k` from `T`; forge signatures
- **Mitigation:** None (protocol fundamentally broken)
- **Timeline:** 15-30 years

**Grover's Algorithm (AES and SHA-256):**
- **Impact:** Reduces AES-256 security to 128 bits; SHA-256 to 128 bits
- **Mitigation:** 128-bit security still acceptable (2^128 operations infeasible)
- **Timeline:** 20-40 years

### 8.3 Post-Quantum Migration

**Future Protocol Versions:**
- Replace secp256k1 with post-quantum signature scheme (e.g., Dilithium, Falcon)
- Replace ECDH with post-quantum key exchange (e.g., Kyber)
- Maintain AES-256 and SHA-256 (Grover-resistant)

**Backward Compatibility:**
- v1.0 vaults cannot be migrated to post-quantum (re-seal required)

---

## 9. Legal and Regulatory Risks

### 9.1 Encryption Regulations

**Export Controls:**
- **Risk:** Some jurisdictions restrict cryptographic software export
- **Impact:** LOCK implementations may be illegal to distribute
- **Mitigation:** Consult legal counsel; comply with local laws

**Key Escrow Requirements:**
- **Risk:** Some jurisdictions require key escrow or backdoors
- **Impact:** LOCK protocol incompatible with escrow (no master key)
- **Mitigation:** Do not deploy in jurisdictions with such requirements

### 9.2 Financial Regulations

**Money Transmission:**
- **Risk:** LOCK vaults used for payments may trigger money transmission laws
- **Impact:** Operators may need licenses
- **Mitigation:** LOCK is a protocol, not a service; users are responsible for compliance

**Sanctions and AML:**
- **Risk:** LOCK used to evade sanctions or launder money
- **Impact:** Regulatory scrutiny; potential bans
- **Mitigation:** LOCK is neutral technology; cannot prevent misuse

### 9.3 Data Protection

**GDPR and Privacy Laws:**
- **Risk:** Vault files contain personal data (recipient address)
- **Impact:** Operators must comply with data protection laws
- **Mitigation:** Vault files are user-controlled; no central storage

---

## 10. Operational Best Practices

### 10.1 Sender Responsibilities

- [ ] Verify recipient address (typos can make vault unusable)
- [ ] Use minimum necessary PoA amount (reduce recipient cost)
- [ ] Set reasonable confirmation requirements (6 for mainnet, 1 for testnet)
- [ ] Communicate timelock clearly (if used)
- [ ] Keep backup of original payload (sender cannot decrypt vault)
- [ ] Transmit vault file over secure channel (encrypted messaging)

### 10.2 Recipient Responsibilities

- [ ] Validate vault file before creating PoA (check structure, network, address)
- [ ] Use reputable wallet (hardware wallet for high-value vaults)
- [ ] Wait for required confirmations (do not rush unseal)
- [ ] Monitor for reorgs (revalidate PoA if confirmations decrease)
- [ ] Securely store decrypted payload (re-encrypt if needed)
- [ ] Delete vault file after unseal (if no longer needed)

### 10.3 Implementation Responsibilities

- [ ] Use audited cryptographic libraries
- [ ] Implement comprehensive test suite (see TESTPLAN.md)
- [ ] Validate all inputs (vault files, blockchain data, user inputs)
- [ ] Handle errors gracefully (clear error messages, recovery paths)
- [ ] Zero secrets after use (secure memory handling)
- [ ] Monitor for security vulnerabilities (dependency updates)
- [ ] Provide clear documentation (user guides, API docs)

---

## 11. Limitations and Non-Goals

### 11.1 Explicit Limitations

**No Sender Revocation:**
- LOCK v1.0 does not support sender revoking vault after creation
- Sender cannot prevent recipient from unsealing (by design)

**No Multi-Recipient:**
- Each vault has exactly one recipient
- Multi-recipient requires creating separate vaults

**No Proof of Unseal:**
- Sender cannot verify if/when vault was unsealed
- Recipient can unseal without sender's knowledge

**No Replay Protection Across Networks:**
- Same vault file can be unsealed on testnet and mainnet (if addresses match)
- Users must validate network field

### 11.2 Non-Goals

**Not a Payment Protocol:**
- LOCK is for data encryption, not payments
- PoA is proof-of-access, not payment to sender

**Not a Messaging Protocol:**
- LOCK is for one-time data transfer, not ongoing communication
- Use dedicated messaging protocols for chat

**Not a Backup Solution:**
- Sender cannot decrypt vault (no recovery if vault file lost)
- Use traditional backups for critical data

**Not a Timestamping Service:**
- Vault creation time is not cryptographically proven
- Use OpenTimestamps or similar for timestamping

---

## 12. Incident Response

### 12.1 Cryptographic Break

**Scenario:** Vulnerability discovered in secp256k1, AES-256, or SHA-256

**Response:**
1. Immediately publish security advisory
2. Recommend users unseal all vaults ASAP
3. Develop and deploy patched protocol version
4. Coordinate with Bitcoin Core and wallet developers

### 12.2 Implementation Bug

**Scenario:** Bug discovered in LOCK implementation (e.g., adaptor extraction)

**Response:**
1. Publish CVE and security advisory
2. Release patched version
3. Provide migration tool for affected vaults (if possible)
4. Notify users via all channels

### 12.3 Blockchain Attack

**Scenario:** 51% attack or deep reorg on Bitcoin

**Response:**
1. Monitor for reorgs affecting PoA transactions
2. Recommend users wait for additional confirmations
3. Provide reorg detection and revalidation tools
4. Coordinate with Bitcoin community

---

## 13. Future Research Directions

### 13.1 Protocol Enhancements

- **Threshold vaults:** Multi-recipient with M-of-N unseal
- **Revocable vaults:** Sender can invalidate before unseal
- **Proof of unseal:** Zero-knowledge proof of decryption
- **Cross-chain vaults:** Use other blockchains for PoA

### 13.2 Privacy Improvements

- **Unlinkable Challenge/PoA:** Use different addresses or payment channels
- **Confidential PoA amounts:** Hide PoA amount on-chain (Confidential Transactions)
- **Stealth addresses:** Recipient address not revealed in vault file

### 13.3 Efficiency Optimizations

- **Batch vaults:** Multiple payloads in single vault (shared Challenge UTXO)
- **Lightning integration:** Use Lightning payments for PoA (instant, off-chain)
- **Compact vault format:** Binary encoding (CBOR) instead of JSON

---

**End of Risk Analysis**

