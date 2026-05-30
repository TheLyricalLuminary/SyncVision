import { createHmac, timingSafeEqual } from 'crypto';

interface TokenPayload {
  packetId: string;
  trackId:  string;
  exp:      number; // unix seconds
}

function getSecret(): string {
  const s = process.env.AUDIO_TOKEN_SECRET;
  if (!s) throw new Error('AUDIO_TOKEN_SECRET not set');
  return s;
}

function sign(payload: TokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac  = createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${mac}`;
}

export function createAudioToken(
  packetId: string,
  trackId:  string,
  expiresAt: Date,
): string {
  return sign({ packetId, trackId, exp: Math.floor(expiresAt.getTime() / 1000) });
}

export function verifyAudioToken(token: string): TokenPayload | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot < 0) return null;
    const data     = token.slice(0, dot);
    const mac      = token.slice(dot + 1);
    const expected = createHmac('sha256', getSecret()).update(data).digest('base64url');
    // Use fixed-length comparison to resist timing attacks
    const macBuf = Buffer.from(mac);
    const expBuf = Buffer.from(expected);
    if (macBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(macBuf, expBuf)) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as TokenPayload;
    if (Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
