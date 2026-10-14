/** Describes the current origin; it does not discover devices or change servers. */
export function isLocalServer(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || /^(fc|fd)[\da-f]{2}:|^fe80:/i.test(host)) return true;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}
export function validInvitation(code: string): boolean { return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(code); }
export function joinLink(origin: string, code: string): string {
  const url = new URL('/', origin); url.searchParams.set('room', code); return url.href;
}
