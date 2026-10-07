import dns from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";

/**
 * DNS fallback for outbound provider requests.
 * The system resolver is always tried first. Only when it fails (ENOTFOUND / EAI_AGAIN) is the hostname
 * resolved through public resolvers. TLS verification and SNI still use the original hostname,
 * so this changes how an address is found, never which server is trusted.
 */
const FALLBACK_SERVERS = ["1.1.1.1", "8.8.8.8"];
let installed = false;

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** Hosts the system resolver failed on, with addresses from the public resolvers (10-minute TTL). */
const fallbackCache = new Map<string, { at: number; addrs: string[] }>();
const FALLBACK_TTL_MS = 10 * 60_000;

function answer(addrs: string[], options: dns.LookupOptions, cb: LookupCb) {
  if (options.all) return cb(null, addrs.map((a) => ({ address: a, family: 4 })));
  cb(null, addrs[0], 4);
}

/** Grace period for the system resolver before public resolvers are also queried. */
const SYSTEM_GRACE_MS = 1500;

function publicResolve(hostname: string, done: (addrs: string[] | null) => void) {
  const r = new dns.Resolver({ timeout: 4000, tries: 2 });
  r.setServers(FALLBACK_SERVERS);
  r.resolve4(hostname, (e, addrs) => done(e || !addrs.length ? null : addrs));
}

function lookupWithFallback(hostname: string, options: dns.LookupOptions, cb: LookupCb) {
  const hit = fallbackCache.get(hostname);
  if (hit && Date.now() - hit.at < FALLBACK_TTL_MS) return answer(hit.addrs, options, cb);
  let settled = false;
  let systemErr: NodeJS.ErrnoException | null = null;
  let publicTried = false;
  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    fn();
  };
  const tryPublic = () => {
    if (publicTried) return;
    publicTried = true;
    publicResolve(hostname, (addrs) => {
      if (addrs) {
        fallbackCache.set(hostname, { at: Date.now(), addrs });
        finish(() => answer(addrs, options, cb));
      } else if (systemErr) finish(() => cb(systemErr, "", 0));
    });
  };
  const timer = setTimeout(tryPublic, SYSTEM_GRACE_MS);
  dns.lookup(hostname, options, (err, address, family) => {
    if (!err) return finish(() => cb(null, address as string, family));
    systemErr = err;
    if (err.code !== "ENOTFOUND" && err.code !== "EAI_AGAIN") return finish(() => cb(err, "", 0));
    tryPublic();
  });
}

export function installDnsFallback(): void {
  if (installed) return;
  installed = true;
  setGlobalDispatcher(new Agent({ connect: { lookup: lookupWithFallback as never } }));
}
