import { networkInterfaces } from 'node:os';

export function getLocalLanIpv4Addresses(): string[] {
  const addresses: string[] = [];

  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses;
}

export function primaryLanIpv4(): string | undefined {
  const addresses = getLocalLanIpv4Addresses();
  return (
    addresses.find((address) => address.startsWith('192.168.')) ??
    addresses.find((address) => address.startsWith('10.')) ??
    addresses[0]
  );
}

export function buildLanBaseUrl(port: number, ip?: string): string | undefined {
  const lanIp = ip ?? primaryLanIpv4();
  if (!lanIp) {
    return undefined;
  }
  return `http://${lanIp}:${port}`;
}
