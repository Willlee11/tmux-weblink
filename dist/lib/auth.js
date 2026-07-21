/**
 * @file Password Hashing + Token Store
 * @description scrypt-based password hashing and cryptographic token management.
 */
import * as crypto from 'node:crypto';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { atomicWriteFileSync } from './atomicWrite.js';
import { getDataRoot } from './state-paths.js';
const scryptAsync = promisify(crypto.scrypt);
// 2026 floor — ~128MB working set, ~50ms on commodity hardware.
const SCRYPT_PARAMS = { N: 131072, r: 8, p: 1, keylen: 32 };
const MIN_N = 16384;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
export async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scryptAsync(password, salt, SCRYPT_PARAMS.keylen, {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        maxmem: SCRYPT_MAXMEM,
    });
    return {
        salt,
        hash: derived.toString('hex'),
        algorithm: 'scrypt',
        params: { ...SCRYPT_PARAMS },
    };
}
export async function verifyPassword(password, stored) {
    if (stored.params.N < MIN_N || stored.params.r < 1 || stored.params.p < 1 || stored.params.keylen < 16) {
        return false;
    }
    const derived = await scryptAsync(password, stored.salt, stored.params.keylen, {
        N: stored.params.N,
        r: stored.params.r,
        p: stored.params.p,
        maxmem: SCRYPT_MAXMEM,
    });
    const storedBuf = Buffer.from(stored.hash, 'hex');
    if (derived.length !== storedBuf.length)
        return false;
    return crypto.timingSafeEqual(derived, storedBuf);
}
const COMMON_PASSWORDS = new Set([
    'password', 'password1', '12345678', '123456789', '1234567890',
    'qwerty123', 'abcdefgh', 'abcd1234', 'letmein01', 'iloveyou',
    'trustno1', 'sunshine1', 'princess1', 'football1', 'charlie1',
    'passw0rd', 'admin123', 'welcome1', 'p@ssw0rd', 'changeme',
]);
export function validatePassword(password) {
    if (password.length < 8)
        return 'Password must be at least 8 characters';
    if (password.length > 128)
        return 'Password must be 128 characters or fewer';
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        return 'This password is too common. Please choose a stronger password';
    }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigitOrSpecial = /[^a-zA-Z]/.test(password);
    if (!hasLetter || !hasDigitOrSpecial) {
        return 'Password must contain at least one letter and one number or special character';
    }
    return null;
}
export function generateToken() {
    const raw = crypto.randomBytes(32);
    const plaintext = raw.toString('base64url');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return { plaintext, hash };
}
export function hashToken(plaintext) {
    const raw = Buffer.from(plaintext, 'base64url');
    return crypto.createHash('sha256').update(raw).digest('hex');
}
const CONFIG_DIR = getDataRoot();
const TOKENS_FILE = path.join(CONFIG_DIR, 'tokens.json');
const TOUCH_THROTTLE_MS = 5 * 60_000;
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
}
export class TokenStore {
    tokens = [];
    constructor() {
        this.load();
    }
    load() {
        let raw;
        try {
            raw = fs.readFileSync(TOKENS_FILE, 'utf-8');
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                this.tokens = [];
                return;
            }
            throw new Error(`Failed to read tokens at ${TOKENS_FILE}: ${err.message}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch (err) {
            const aside = `${TOKENS_FILE}.corrupt-${Date.now()}`;
            try {
                fs.renameSync(TOKENS_FILE, aside);
            }
            catch { }
            throw new Error(`tokens.json was corrupt (saved aside as ${aside}): ${err.message}`);
        }
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tokens)) {
            this.tokens = parsed.tokens;
            return;
        }
        const aside = `${TOKENS_FILE}.malformed-${Date.now()}`;
        try {
            fs.renameSync(TOKENS_FILE, aside);
        }
        catch { }
        throw new Error(`tokens.json had unexpected shape (saved aside as ${aside})`);
    }
    save() {
        ensureConfigDir();
        atomicWriteFileSync(TOKENS_FILE, JSON.stringify({ tokens: this.tokens }, null, 2) + '\n', 0o600);
    }
    validateToken(plaintext) {
        const tokenHash = hashToken(plaintext);
        for (const token of this.tokens) {
            if (token.tokenHash !== tokenHash)
                continue;
            if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
                return null;
            }
            return token;
        }
        return null;
    }
    touch(tokenHash) {
        const token = this.tokens.find((t) => t.tokenHash === tokenHash);
        if (!token)
            return;
        const now = Date.now();
        const last = new Date(token.lastUsedAt).getTime();
        if (now - last < TOUCH_THROTTLE_MS)
            return;
        token.lastUsedAt = new Date(now).toISOString();
        this.save();
    }
    createAccessToken(name, ttlDays) {
        ensureConfigDir();
        const { plaintext, hash: tokenHash } = generateToken();
        const now = new Date();
        const stored = {
            id: crypto.randomUUID(),
            name: name.slice(0, 100) || `Token (${Date.now()})`,
            tokenHash,
            createdAt: now.toISOString(),
            lastUsedAt: now.toISOString(),
            expiresAt: ttlDays ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000).toISOString() : null,
        };
        this.tokens.push(stored);
        this.save();
        return { stored, plaintext };
    }
    list() {
        return this.tokens.map((t) => ({ ...t }));
    }
    revoke(tokenId) {
        const initial = this.tokens.length;
        this.tokens = this.tokens.filter((t) => t.id !== tokenId);
        if (this.tokens.length !== initial) {
            this.save();
            return true;
        }
        return false;
    }
    revokeAll() {
        if (this.tokens.length === 0)
            return;
        this.tokens = [];
        this.save();
    }
    purgeExpired() {
        const now = new Date();
        const initial = this.tokens.length;
        this.tokens = this.tokens.filter((t) => !t.expiresAt || new Date(t.expiresAt) >= now);
        if (this.tokens.length !== initial) {
            this.save();
        }
    }
}
