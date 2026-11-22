/** Reads an environment variable that must be set. A missing one is an error: there is no default */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See apps/api/.env.example.`);
  return value;
}

/**
 * Reads a list of web origins, separated by commas. Each must be written the way a browser reports an origin:
 * scheme, host and port, with no path and no trailing slash.
 * A wrong spelling is an error here. Otherwise it would never match what a browser reports, and the symptom would
 * be every request from the web page failing while the server logs nothing.
 */
export function requireOrigins(name: string): string[] {
  return requireEnv(name)
    .split(',')
    .map((item) => {
      const origin = item.trim();
      if (!URL.canParse(origin) || new URL(origin).origin !== origin) {
        throw new Error(
          `Environment variable ${name} has an invalid origin "${origin}". Write it like http://localhost:11211, with no path and no trailing slash.`
        );
      }
      return origin;
    });
}

/**
 * Reads an optional port number: fallback when it is not set. Set to anything but a whole number from 1 to 65535
 * is an error.
 */
export function portFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Environment variable ${name} must be a port number between 1 and 65535, got "${value}".`);
  }
  return port;
}
