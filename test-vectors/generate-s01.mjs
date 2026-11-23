#!/usr/bin/env node
/**
 * Device-binding vector s01 generator.
 *
 *   node test-vectors/generate-s01.mjs
 *
 * A binding_sig covers its record's statement, or the statement without its
 * final LF, which is what a wallet that trims the text before signing it signs
 * (SPEC §3.3). It covers no other text. s01 holds the b01 bind and the r01
 * revocation signed without their final LF, which a reader accepts, and records
 * signed over other texts, which it discards. Every record's content is the
 * statement with its final LF.
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

/** A record whose content is `statement`, its final LF included, and whose binding_sig covers `signed`. */
function record(description, template, keyField, statement, signed) {
    const binding_sig = sign(signed);
    const event = { ...template.event, tags: withSig(template.event.tags, binding_sig) };
    if (event.content !== statement) throw new Error('template content is not the statement');
    return {
        description,
        signed,
        binding_sig,
        ...keyField,
        event,
        event_id: eventId(event),
    };
}

const bindKey = { nostr_sk: b01.expected.nostr_sk };
const carrierKey = { carrier_nostr_sk: r01.inputs.carrier_nostr_sk };
const bind = (description, signed) => record(description, b01.expected, bindKey, BIND, signed);
const revocation = (description, signed) => record(description, r01.expected.revocation, carrierKey, REVOCATION, signed);

const accepted = {
    bind_without_lf: bind(
        'The b01 bind, carried by its own Nostr key, with a binding_sig over its statement without the final LF. A reader accepts it (§3.3).',
        BIND.slice(0, -1)
    ),
    revocation_without_lf: revocation(
        'The r01 revocation, carried by the r01 carrier key, with a binding_sig over its statement without the final LF. It retires the b01 bind (§3.3, §3.5).',
        REVOCATION.slice(0, -1)
    ),
};
const rejected = {
    bind_second_lf: bind('The b01 bind with a binding_sig over its statement and a second LF.', `${BIND}\n`),
    bind_crlf: bind('The b01 bind with a binding_sig over its statement ending in CR LF.', `${BIND.slice(0, -1)}\r\n`),
    bind_leading_space: bind('The b01 bind with a binding_sig over its statement after a space.', ` ${BIND}`),
    bind_cut_past_lf: bind(
        'The b01 bind with a binding_sig over its statement without its last two bytes: the final LF and the last character of created_at.',
        BIND.slice(0, -2)
    ),
    revocation_second_lf: revocation(
        'The r01 revocation with a binding_sig over its statement and a second LF. It retires nothing (§3.5).',
        `${REVOCATION}\n`
    ),
};

// Each signature verifies over the text it covers, and only a signature over the statement
// without its final LF verifies over that: a reader that checked the content alone would
// refuse the accepted records, and one that tried more texts would keep the rejected ones.
for (const [name, r] of Object.entries({ ...accepted, ...rejected })) {
    const statement = r.event.content;
    if (!verifySignature(ADDRESS, r.signed, r.binding_sig)) throw new Error(`${name}: does not verify over its text`);
    if (verifySignature(ADDRESS, statement, r.binding_sig)) throw new Error(`${name}: verifies over the statement`);
    const overTrimmed = verifySignature(ADDRESS, statement.slice(0, -1), r.binding_sig);
    if (overTrimmed !== name in accepted) throw new Error(`${name}: over the statement without its LF: ${overTrimmed}`);
}

const names = {
    b01: `expected.b01.event (b01-bind-v3.json expected.event), id ${b01.expected.event_id}`,
    ...Object.fromEntries(Object.entries(accepted).map(([n, r]) => [n, `expected.${n}.event, id ${r.event_id}`])),
    ...Object.fromEntries(Object.entries(rejected).map(([n, r]) => [n, `reject.${n}.event, id ${r.event_id}`])),
};

const vector = {
    description:
        'Device records whose binding_sig covers another text than the record content (SPEC §3.3). The b01 bind and the r01 revocation signed over their statements without the final LF, as a wallet that trims the text before signing it signs, count as if signed over the statements. A record signed over any other text does not verify. Every record’s content is its statement with the final LF. The address and key are BIP-322’s own published test vector key (P2WPKH, mainnet); never use them for anything real.',
    inputs: {
        address: ADDRESS,
        bitcoin_wif: b01.inputs.bitcoin_wif,
        device_id: b01.inputs.device_id,
        reader_time: READER_TIME,
    },
    expected: {
        b01: { event: b01.expected.event, event_id: b01.expected.event_id },
        ...accepted,
        live: {
            description:
                'Each case is the union of the records a reader received for the address, judged at inputs.reader_time. live lists the binds a sender may seal to.',
            cases: [
                { records: ['bind_without_lf'], live: ['bind_without_lf'] },
                { records: ['bind_without_lf', 'revocation_without_lf'], live: [] },
                { records: ['b01', 'revocation_without_lf'], live: [] },
                { records: ['bind_second_lf'], live: [] },
                { records: ['bind_crlf'], live: [] },
                { records: ['bind_leading_space'], live: [] },
                { records: ['bind_cut_past_lf'], live: [] },
                { records: ['b01', 'revocation_second_lf'], live: ['b01'] },
            ],
            names,
        },
    },
    reject: rejected,
};

writeFileSync(join(DIR, 's01-signed-without-final-lf.json'), `${JSON.stringify(vector, null, 2)}\n`);
console.log('wrote device-binding/s01-signed-without-final-lf.json');
