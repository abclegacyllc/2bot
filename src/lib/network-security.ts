import { isIP } from 'net';

/**
 * Validates a URL to prevent Server-Side Request Forgery (SSRF)
 * Blocks:
 * - Localhost / Loopback (127.x.x.x, ::1)
 * - Private IPs (10.x.x.x, 192.168.x.x, 172.16-31.x.x)
 * - Metadata services (169.254.x.x)
 * - AWS/Cloud metadata
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    const { hostname } = parsed;

    // Check if hostname is an IP address
    const ipVersion = isIP(hostname);
    if (ipVersion !== 0) {
      return isSafeIp(hostname);
    }

    // Block localhost literal
    if (hostname === 'localhost') {
      return false;
    }

    // DNS Rebinding protection requires resolving the hostname,
    // but for synchronous check we mainly block obvious bad patterns.
    // In strict environments, use a proxy or resolving agent.
    
    return true;
  } catch (_e) {
    return false; // Invalid URL
  }
}

function isSafeIp(ip: string): boolean {
  // IPv4 Checks
  if (isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    
    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return false;
    
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return false;
    
    // 10.0.0.0/8 (Private)
    if (parts[0] === 10) return false;
    
    // 172.16.0.0/12 (Private)
    if (parts[0] === 172 && (parts[1] || 0) >= 16 && (parts[1] || 0) <= 31) return false;
    
    // 192.168.0.0/16 (Private)
    if (parts[0] === 192 && parts[1] === 168) return false;
    
    // 169.254.0.0/16 (Link-local / Cloud Metadata)
    if (parts[0] === 169 && parts[1] === 254) return false;
    
    return true;
  }
  
  // IPv6 Checks
  if (isIP(ip) === 6) {
    // ::1 (Loopback)
    if (ip === '::1') return false;
    // fc00::/7 (Unique Local)
    if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return false;
    // fe80::/10 (Link-local)
    if (ip.toLowerCase().startsWith('fe80')) return false;
    
    return true;
  }

  return false;
}
