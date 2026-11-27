import { isIPv6 } from 'node:net';

// Ключ ліміту за мережею клієнта. Власник IPv6 отримує щонайменше /64, тож різні адреси з однієї такої мережі це
// той самий клієнт: інакше кожна нова адреса мала б власний лічильник.
export function clientNetwork(ip: string): string {
  const address = ip.split('%')[0];
  if (!isIPv6(address) || address.includes('.')) return ip; // IPv4, зокрема ::ffff:a.b.c.d
  const [head, tail] = address.split('::');
  const groups = (part: string | undefined) => (part ? part.split(':') : []);
  const left = groups(head);
  const right = groups(tail);
  const zeros = tail === undefined ? [] : Array<string>(8 - left.length - right.length).fill('0');
  const prefix = [...left, ...zeros, ...right].slice(0, 4).map((group) => parseInt(group, 16).toString(16));
  return `${prefix.join(':')}::/64`;
}
