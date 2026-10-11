export function takeArcadeName(hash: string): { name?: string; hash: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('arcadeName')) return { hash };
  const name = params.get('arcadeName')?.trim() ?? '';
  params.delete('arcadeName');
  return { name: name.length > 0 && name.length <= 20 && !/[\u0000-\u001f\u007f\ufffd]/u.test(name) ? name : undefined, hash: params.size ? `#${params}` : '' };
}
