/**
 * Network diagnostic for provider hosts (bounded timeouts; no credentials printed).
 * For each host: system DNS, public DNS (A and AAAA), TCP connect per address, TLS handshake with SNI,
 * and an HTTP request (MCP initialize for agent.bitget.com). Also records proxy configuration presence.
 * Output: evidence/network-diagnostics.json
 */
import dns from "node:dns";
import net from "node:net";
import tls from "node:tls";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, log, writeJsonAtomic } from "./lib/fsx";

const HOSTS = ["agent.bitget.com", "www.bitget.com", "api.bitget.com", "api.nasdaq.com", "generativelanguage.googleapis.com"];
const T = 8000;

const withTimeout = <X,>(p: Promise<X>, ms: number, label: string) =>
  Promise.race([p, new Promise<X>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout after ${ms} ms`)), ms))]);

const errInfo = (e: unknown) => {
  const x = e as { code?: string; message?: string };
  return { code: x.code ?? null, message: (x.message ?? String(e)).slice(0, 200) };
};

async function systemLookup(host: string) {
  try {
    const r = await withTimeout(dns.promises.lookup(host, { all: true }), T, "system dns");
    return { ok: true, addresses: r.map((a) => a.address) };
  } catch (e) {
    return { ok: false, error: errInfo(e) };
  }
}

async function publicLookup(host: string) {
  const r = new dns.promises.Resolver({ timeout: 4000, tries: 1 });
  r.setServers(["1.1.1.1", "8.8.8.8"]);
  const out: { a: string[]; aaaa: string[]; error: unknown } = { a: [], aaaa: [], error: null };
  try {
    out.a = await r.resolve4(host);
  } catch (e) {
    out.error = errInfo(e);
  }
  try {
    out.aaaa = await r.resolve6(host);
  } catch {
    /* optional */
  }
  return out;
}

function tcp(address: string): Promise<{ address: string; ok: boolean; ms: number; error?: unknown }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const s = net.connect({ host: address, port: 443, family: address.includes(":") ? 6 : 4 });
    const done = (ok: boolean, error?: unknown) => {
      s.destroy();
      resolve({ address, ok, ms: Date.now() - started, ...(error ? { error } : {}) });
    };
    s.setTimeout(T, () => done(false, { code: "TCP_TIMEOUT", message: `no connection within ${T} ms` }));
    s.once("connect", () => done(true));
    s.once("error", (e) => done(false, errInfo(e)));
  });
}

function tlsHandshake(address: string, servername: string): Promise<{ ok: boolean; protocol?: string | null; subject?: string; error?: unknown }> {
  return new Promise((resolve) => {
    const s = tls.connect({ host: address, port: 443, servername, timeout: T });
    s.once("secureConnect", () => {
      const cert = s.getPeerCertificate();
      resolve({ ok: s.authorized, protocol: s.getProtocol(), subject: String(cert?.subject?.CN ?? "") });
      s.destroy();
    });
    s.once("timeout", () => {
      resolve({ ok: false, error: { code: "TLS_TIMEOUT", message: `no handshake within ${T} ms` } });
      s.destroy();
    });
    s.once("error", (e) => resolve({ ok: false, error: errInfo(e) }));
  });
}

function httpsRequest(address: string, host: string, path: string, body: string | null): Promise<{ ok: boolean; status?: number; snippet?: string; error?: unknown }> {
  return new Promise((resolve) => {
    const s = tls.connect({ host: address, port: 443, servername: host, timeout: T }, () => {
      const req =
        `${body ? "POST" : "GET"} ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: reanchor-diagnostic\r\nAccept: application/json, text/event-stream\r\nConnection: close\r\n` +
        (body ? `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n` : "") +
        `\r\n${body ?? ""}`;
      s.write(req);
    });
    let data = "";
    s.on("data", (d) => (data += d.toString("utf8")));
    s.once("end", () => {
      const m = /^HTTP\/1\.1 (\d{3})/.exec(data);
      resolve({ ok: !!m, status: m ? Number(m[1]) : undefined, snippet: data.split("\r\n\r\n")[1]?.slice(0, 300) });
    });
    s.once("timeout", () => {
      resolve({ ok: false, error: { code: "HTTP_TIMEOUT", message: `no response within ${T} ms` } });
      s.destroy();
    });
    s.once("error", (e) => resolve({ ok: false, error: errInfo(e) }));
  });
}

function proxyConfig() {
  const mask = (v: string | undefined) => (v ? v.replace(/\/\/[^@/]+@/, "//***@") : null);
  const env = Object.fromEntries(["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy"].map((k) => [k, mask(process.env[k])]));
  const run = (cmd: string) => {
    try {
      return execSync(cmd, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim().replace(/\/\/[^@/\s]+@/g, "//***@");
    } catch {
      return null;
    }
  };
  return {
    env,
    npmProxy: run("npm config get proxy"),
    npmHttpsProxy: run("npm config get https-proxy"),
    winhttp: run("netsh winhttp show proxy"),
    wininetProxyEnable: run('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable'),
    wininetProxyServer: run('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer'),
    // Only whether a default gateway exists; its address identifies the local network and is not recorded.
    defaultGatewayPresent: run("powershell -NoProfile -Command \"(Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway}).IPv4DefaultGateway.NextHop\"") ? true : false,
  };
}

async function main() {
  const at = new Date().toISOString();
  const hosts: Record<string, unknown> = {};
  for (const host of HOSTS) {
    const sys = await systemLookup(host);
    const pub = await publicLookup(host);
    const addrs = [...new Set([...(sys.ok ? (sys.addresses as string[]) : []), ...pub.a, ...pub.aaaa.slice(0, 1)])].slice(0, 5);
    const tcpResults = [];
    for (const a of addrs) tcpResults.push(await tcp(a));
    const firstOk = tcpResults.find((t) => t.ok);
    const tlsResult = firstOk ? await tlsHandshake(firstOk.address, host) : null;
    let http = null;
    if (firstOk && tlsResult?.ok) {
      http =
        host === "agent.bitget.com"
          ? await httpsRequest(firstOk.address, host, "/mcp", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "reanchor-diagnostic", version: "1" } } }))
          : await httpsRequest(firstOk.address, host, "/", null);
    }
    const stage = !sys.ok && !pub.a.length ? "DNS" : !firstOk ? "TCP" : !tlsResult?.ok ? "TLS" : !http?.ok ? "HTTP" : "OK";
    hosts[host] = { failedStage: stage === "OK" ? null : stage, systemDns: sys, publicDns: pub, tcp: tcpResults, tls: tlsResult, http };
    log(`${host}: ${stage === "OK" ? `reachable (HTTP ${(http as { status?: number }).status})` : `fails at ${stage}`}`);
  }
  writeJsonAtomic(join(ROOT, "evidence", "network-diagnostics.json"), { at, timeoutMs: T, proxy: proxyConfig(), hosts });
  log("Wrote evidence/network-diagnostics.json");
}

main();
