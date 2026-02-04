import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Validates that an incoming request originates from the Agent service.
 *
 * Checks the `x-agent-secret` header against the AGENT_SECRET env var
 * using a timing-safe comparison to prevent side-channel attacks.
 *
 * Returns false when AGENT_SECRET is not configured (secure by default).
 */
export function validateAgentRequest(req: NextRequest): boolean {
    const authHeader = req.headers.get('x-agent-secret');
    const secret = process.env.AGENT_SECRET;

    // Block all agent requests when secret is not configured
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('AGENT_SECRET not set in production — blocking agent request');
        }
        return false;
    }

    if (!authHeader) {
        return false;
    }

    // Timing-safe comparison to prevent side-channel extraction of the secret
    try {
        const headerBuf = Buffer.from(authHeader, 'utf-8');
        const secretBuf = Buffer.from(secret, 'utf-8');

        if (headerBuf.length !== secretBuf.length) {
            return false;
        }

        return timingSafeEqual(headerBuf, secretBuf);
    } catch {
        return false;
    }
}
