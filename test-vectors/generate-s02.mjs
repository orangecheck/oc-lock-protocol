#!/usr/bin/env node
/**
 * Device-binding vector s02 generator.
 *
 *   node test-vectors/generate-s02.mjs
 *
 * A publisher writes as event.content exactly the bytes its binding_sig covers
 * (SPEC §3.3). A wallet that trims the text before signing it signs the
 * statement without its final LF, so that record's content has none, and a
 * reader MUST NOT refuse it for that. s02 holds the b01 bind and the r01
 * revocation written that way, and the same two records signed over the
 * statement with its LF under content without it, which a reader discards:
 * the content is what was signed, so a reader never adds the LF back. Each
 * case holds for a reader that checks binding_sig over event.content alone
 * as well as for one that also tries it without its final LF.
 *
 * Signs with @orangecheck/bip322 (deterministic, RFC 6979), resolved from an
 * oc-packages checkout next to this repository; set OC_SDK_NODE_MODULES to use
 * another. It first reproduces b01's binding_sig and the b01 and r01 event ids.
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_NODE_MODULES =
    process.env.OC_SDK_NODE_MODULES ?? join(__dirname, '..', '..', 'oc-packages', 'sdk', 'node_modules');
const require = createRequire(join(SDK_NODE_MODULES, '_.js'));
const { addressFromPrivateKey, signMessage, verifySignature } = require('@orangecheck/bip322');
const { base58 } = require('@scure/base');

const DIR = join(__dirname, 'device-binding');
const load = (name) => JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8'));
const b01 = load('b01-bind-v3');
const r01 = load('r01-revoke-k2');

const READER_TIME = '2026-11-22T00:00:00.000Z';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest();

// WIF: 0x80, the 32-byte key, 0x01 (compressed), then a 4-byte sha256d checksum.
const wif = base58.decode(b01.inputs.bitcoin_wif);
const body = wif.subarray(0, -4);
if (!sha256(sha256(body)).subarray(0, 4).equals(Buffer.from(wif.subarray(-4)))) throw new Error('WIF checksum');
if (body.length !== 34 || body[0] !== 0x80 || body[33] !== 0x01) throw new Error('not a compressed mainnet WIF');
const KEY = Buffer.from(body.subarray(1, 33)).toString('hex');
const ADDRESS = b01.inputs.address;
if (addressFromPrivateKey(KEY, 'p2wpkh') !== ADDRESS) throw new Error('the WIF is not the address key');

// NIP-01: the id is the SHA-256 of [0, pubkey, created_at, kind, tags, content].
const eventId = (e) => sha256(JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content])).toString('hex');
const sign = (text) => signMessage(ADDRESS, text, KEY);

const BIND = b01.expected.statement;
const REVOCATION = r01.expected.revocation.statement;
if (sign(BIND) !== b01.expected.binding_sig) throw new Error('b01 binding_sig does not reproduce');
if (eventId(b01.expected.event) !== b01.expected.event_id) throw new Error('b01 event id does not reproduce');
if (eventId(r01.expected.revocation.event) !== r01.expected.revocation.event_id) throw new Error('r01 event id');

const withSig = (tags, sig) => tags.map((t) => (t[0] === 'binding_sig' ? ['binding_sig', sig] : t));

/** A record whose content is `content` and whose binding_sig covers `signed`. */
function record(description, template, keyField, content, signed) {
    const binding_sig = sign(signed);
    const event = { ...template.event, content, tags: withSig(template.event.tags, binding_sig) };
    return { description, signed, binding_sig, ...keyField, event, event_id: eventId(event) };
}

const bindKey = { nostr_sk: b01.expected.nostr_sk };
const carrierKey = { carrier_nostr_sk: r01.inputs.carrier_nostr_sk };
const bind = (description, signed) => record(description, b01.expected, bindKey, BIND.slice(0, -1), signed);
const revocation = (description, signed) =>
    record(description, r01.expected.revocation, carrierKey, REVOCATION.slice(0, -1), signed);

const accepted = {
    bind_without_lf: bind(
        'The b01 bind, carried by its own Nostr key, written as the bytes its binding_sig covers: the statement without its final LF. A reader accepts it (§3.3).',
        BIND.slice(0, -1)
    ),
    revocation_without_lf: revocation(
        'The r01 revocation, carried by the r01 carrier key, written as the bytes its binding_sig covers: the statement without its final LF. It retires the b01 bind (§3.3, §3.5).',
        REVOCATION.slice(0, -1)
    ),
};
const rejected = {
    bind_signed_with_lf: bind(
        'The b01 bind with content without its final LF and a binding_sig over the statement with it: the signature covers another text than the content or the content without a final LF.',
        BIND
    ),
    revocation_signed_with_lf: revocation(
        'The r01 revocation with content without its final LF and a binding_sig over the statement with it. It retires nothing (§3.5).',
        REVOCATION
    ),
};

// Every record's content is the statement without its final LF. An accepted record's
// signature verifies over its content; a rejected one's over the content with an LF
// added, and not over the content. Neither reading tries that text, so both readers
// judge every record alike.
for (const [name, r] of Object.entries({ ...accepted, ...rejected })) {
    const content = r.event.content;
    if (content.endsWith('\n')) throw new Error(`${name}: content ends in LF`);
    if (!verifySignature(ADDRESS, r.signed, r.binding_sig)) throw new Error(`${name}: does not verify over its text`);
    if (verifySignature(ADDRESS, content, r.binding_sig) !== name in accepted) {
        throw new Error(`${name}: over its content: ${!(name in accepted)}`);
    }
}

const names = {
    b01: `expected.b01.event (b01-bind-v3.json expected.event), id ${b01.expected.event_id}`,
    r01: `expected.r01.event (r01-revoke-k2.json expected.revocation.event), id ${r01.expected.revocation.event_id}`,
    ...Object.fromEntries(Object.entries(accepted).map(([n, r]) => [n, `expected.${n}.event, id ${r.event_id}`])),
    ...Object.fromEntries(Object.entries(rejected).map(([n, r]) => [n, `reject.${n}.event, id ${r.event_id}`])),
};

const vector = {
    description:
        'Device records written as the bytes their binding_sig covers (SPEC §3.3). A wallet that trims the text before signing it signs the statement without its final LF, and the publisher writes that as event.content. The b01 bind and the r01 revocation written that way are accepted, and the revocation retires the bind. The same records signed over the statement with its final LF under content without it do not verify: a reader checks the signature over the content, or the content without a final LF, and never adds one. The address and key are BIP-322’s own published test vector key (P2WPKH, mainnet); never use them for anything real.',
    inputs: {
        address: ADDRESS,
        bitcoin_wif: b01.inputs.bitcoin_wif,
        device_id: b01.inputs.device_id,
        reader_time: READER_TIME,
    },
    expected: {
        b01: { event: b01.expected.event, event_id: b01.expected.event_id },
        r01: {
            event: r01.expected.revocation.event,
            event_id: r01.expected.revocation.event_id,
            carrier_nostr_sk: r01.inputs.carrier_nostr_sk,
        },
        ...accepted,
        live: {
            description:
                'Each case is the union of the records a reader received for the address, judged at inputs.reader_time. live lists the binds a sender may seal to.',
            cases: [
                { records: ['bind_without_lf'], live: ['bind_without_lf'] },
                { records: ['b01', 'revocation_without_lf'], live: [] },
                { records: ['bind_without_lf', 'revocation_without_lf'], live: [] },
                { records: ['bind_without_lf', 'r01'], live: [] },
                { records: ['bind_signed_with_lf'], live: [] },
                { records: ['b01', 'revocation_signed_with_lf'], live: ['b01'] },
            ],
            names,
        },
    },
    reject: rejected,
};

writeFileSync(join(DIR, 's02-content-without-final-lf.json'), `${JSON.stringify(vector, null, 2)}\n`);
console.log('wrote device-binding/s02-content-without-final-lf.json');
