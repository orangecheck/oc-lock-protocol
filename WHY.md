# Why OC Lock v2 exists — a postmortem of v1

> This is a retrospective on the LOCK Protocol as it stood in 2024–2025, why the prior web implementation failed to ship, and the design principles that shaped OC Lock v2.

## What v1 tried to do

LOCK v1.0 (the original [whitepaper](https://github.com/orangecheck/oc-lock/blob/v1.0/WHITEPAPER.md)) proposed Bitcoin-enforced access control using **adaptor signatures**. The idea: the decryption key `k` is cryptographically locked such that spending a specific Bitcoin UTXO reveals `k` on-chain. The recipient cannot decrypt without broadcasting a valid transaction; an observer watching the chain can extract `k` from the witness data and decrypt too — unless the signer uses a fresh adaptor each time.

In theory: elegant. Decryption is *equivalent* to performing a Bitcoin transaction. No server, no trust.

LOCK v1.1 pivoted to **Proof-of-Access (PoA)**: drop adaptor signatures, keep the chain as an oracle. A vault declares unlock rules ("a tx spending ≥ 10,000 sats from address X confirmed at or after block Y"), and a client validates an unlock attempt against those rules by inspecting the chain. No fancy cryptography, just predicates over Bitcoin transactions.

In both versions, the chain is load-bearing for every seal and every unseal.

## Why v1.0 failed

### No browser-compatible adaptor signature library

Adaptor signatures require elliptic-curve scalar arithmetic over secp256k1 with careful side-channel resistance. The production-quality implementations live in C (`libsecp256k1` with the `musig` module) and Rust. There was no shippable WASM build in 2024–2025 that a web app could just import. Attempts to port the math to pure JavaScript either (a) never completed, or (b) shipped a "simplified" version that embedded the secret directly in the vault file:

> The current implementation has a fundamental misunderstanding of how adaptor signatures work in the LOCK protocol. The code implements a 'simplified' adaptor signature that just embeds the secret `k` directly in the template, which completely defeats the purpose of the protocol.
>
> — `docs/oc-lock/ANALYSIS.md` in oc-web, circa late 2025

This is not a bug. This is the cryptography being impossible to ship in the target environment.

### PSBT loops are UX death

Even if the crypto worked, the recipient had to:

1. Receive a PSBT from the sender's server/client.
2. Import the PSBT into a desktop wallet (Sparrow, Electrum, Coldcard) — there is no mobile wallet in 2025 that handles adaptor-aware PSBTs.
3. Sign it.
4. Export the signed PSBT.
5. Upload it back to the web client or broadcast it manually.
6. Wait 10+ minutes for confirmation.
7. Have the web client scan the chain and extract `k` from the witness.
8. Decrypt.

Eight steps. Three of them (import / sign / export) happen in a non-web tool. The success rate for non-technical users is zero.

## Why v1.1 didn't fix it

PoA removed the WASM dependency. It did not remove the transaction loop. In PoA:

- **Sender**: must broadcast a **binding transaction** before the vault is valid. Users (reasonably) asked "why am I spending sats to encrypt a file?"
- **Recipient**: must broadcast an **unlock transaction** with an *exact* satoshi amount to an authorized address. Fat-finger the amount → failure with cryptic error. Forget the fee → TX sits unconfirmed indefinitely.
- **Both**: wait for confirmations. The chain is the critical path for every operation.

From the v1.1 whitepaper's own product Q&A:

> UX pain points for mainstream users:
> - Crafting on-chain transactions without exposing them to timing risks.
> - Understanding why an unlock failed (wrong amount, unconfirmed, fee too low).
> - Waiting for confirmations when block space is congested.
> - Handling multiple wallets or hardware signers in multi-device workflows.

These are not bugs. These are inherent to "Bitcoin transaction in the critical path." You cannot make a 10-minute wait feel fast.

## The other cliffs

Beyond the two big failures, v1.x had several smaller onboarding cliffs that compounded:

1. **Recipient must publish a BIP-322 signature before receiving anything.** To send Alice a vault, Alice must first go somewhere, sign a message, and publish the signature so Bob can extract her pubkey. If Alice hasn't done this, Bob is stuck. "Pre-registration" friction kills viral loops.

2. **The protocol separates SEAL and metadata.** SEAL (ciphertext) can live anywhere — IPFS, USB, paper. Metadata (unlock rules, encrypted with ECDH) must be transmitted with or alongside it. In practice, nobody keeps them together correctly. Lost metadata = lost vault.

3. **Vault ids depend on the binding txid.** Change the amount? New binding TX. New txid. New vault id. All references break.

4. **No recovery story.** If the recipient loses their private key, the vault is dead forever. If the sender loses theirs, they can't rebind. There's a "rebind protocol" in v1.1, but it's another multi-step dance requiring the old private key anyway.

5. **Client-tracked unlock counters.** v1.1 supports "1-use" and "N-use" vaults, but enforcement is client-side: the client maintains an off-chain counter. Sync across devices is undefined. A malicious client ignores it entirely.

## What we kept

Not everything in v1 was wrong. The intellectual core is sound and v2 preserves it:

- **Bitcoin addresses as identities.** An address is a public commitment to a key. Using it as the identity layer for encryption is the right call.
- **ECDH metadata encryption with recipient's long-term key.** Elegant. No out-of-band key exchange. v2 keeps this, just with X25519 device keys instead of raw Bitcoin pubkeys.
- **BIP-322 as the proof-of-control primitive.** All major wallets support it. Lightweight. Verifiable offline.
- **Decoupling storage from access.** A `.lock` envelope can live anywhere. v2 keeps this — the envelope is a self-contained JSON blob.

## What we explicitly discarded

- **On-chain transactions in the critical path for sealing.** Gone. Sealing is purely local.
- **On-chain transactions in the critical path for unsealing** *for the default case*. Gone in identity mode; retained as an explicit, scoped mode for commerce (`payment` mode with a named relay).
- **Adaptor signatures.** Gone. No WASM dependency.
- **PSBT round-trips.** Gone. BIP-322 `signMessage` is the only wallet interaction.
- **Recipient pre-registration via one-off BIP-322 sig publication.** Replaced by device-key records on Nostr that are generated automatically on first visit — one click per browser.
- **Binding txid as vault id component.** Gone. Envelope id is the SHA-256 of the canonical envelope bytes, computable from the envelope alone.

## The design principles that survived

1. **Bitcoin does one thing: proves control of an address.** Anything else should go to a different layer (Nostr for discovery, the web app for UX, X25519 for crypto).
2. **One signing ceremony per device, forever.** Everything after first-run is zero-click.
3. **Standard, audited crypto only.** X25519, HKDF-SHA256, AES-256-GCM. All widely available in WebCrypto. No hand-rolled primitives.
4. **Offline-verifiable.** Given the envelope, the sender's address, and the recipient's device record, anyone can verify authenticity without a server.
5. **Escape hatches for commerce.** Payment mode exists. It requires a trusted relay. We named it instead of pretending it doesn't exist.

## What we still don't have and what we'd do in v3

- **Trustless payment mode.** Requires DLC oracles, BIP-118 (ANYPREVOUT), or a similar covenant. Not shippable today.
- **Full forward secrecy with zero server state.** Hard. Double ratchet needs state sync. Probably not worth the UX cost for the primary use case.
- **Post-quantum readiness.** Not attempted. X25519 and secp256k1 are both classically secure. A PQ variant would wrap `content_key` in Kyber-768 as well.

## References

- `lock-protocol/WHITEPAPER.md` — the v1.1 spec, 1049 lines. Lives at `github.com/orangecheck/_lock-protocol-archive`.
- `lock-sdk/` — the abandoned v1.x TypeScript monorepo (8 packages, 3 complete). Preserved for reference; not a dependency of v2.
- `oc-web/docs/oc-lock/ANALYSIS.md` — internal postmortem of the browser impl attempt. Referenced above.

v2 doesn't claim to be a clever protocol. It claims to be a shippable one. That's the whole point.
