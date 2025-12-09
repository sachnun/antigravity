export function generateSessionId(): string {
  const n = BigInt(Math.floor(Math.random() * 9e18) + 1e18);
  return `-${n.toString()}`;
}
