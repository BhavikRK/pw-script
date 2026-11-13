import {expect, Page, test} from "@playwright/test";

// Proves the browser's traffic goes through --proxyServer, using https://api.ipify.org/?format=json:
//
//   asm-playwright-runner samples/proxy/proxy-ipify.spec.ts --proxyServer http://103.237.102.191:11111
//
// - The browser (proxied) must see a different IP than this Node process (never proxied).
// - When the proxy host is an IP address, the browser must see exactly that IP. For a proxy whose
//   egress IP differs from its host, pass it with --envVars EXPECTED_PROXY_IP=<ip>.

const IPIFY = "api.ipify.org/?format=json";
const IP = /^[0-9a-f.:]+$/i;

/** The IP the proxy should present: EXPECTED_PROXY_IP, else the --proxyServer host if it is an IP. */
function expectedProxyIp(): string | undefined {
    if (process.env.EXPECTED_PROXY_IP) return process.env.EXPECTED_PROXY_IP.trim();

    const server = process.env.ASM_PROXY_SERVER;
    if (!server) return undefined;
    const host = new URL(server.includes("://") ? server : `http://${server}`).hostname.replace(/^\[|\]$/g, "");
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") ? host : undefined;
}

/** This process's own IP - Node's fetch does not use the browser's proxy. */
async function directIp(): Promise<string> {
    const response = await fetch(`https://${IPIFY}`);
    return (await response.json()).ip;
}

async function browserIp(page: Page, url: string): Promise<string> {
    const response = await page.goto(url);
    expect(response?.ok(), `${url} answered ${response?.status()}`).toBeTruthy();

    const ip = String(JSON.parse(await page.locator("body").innerText()).ip ?? "");
    expect(ip, `no IP in ${url}`).toMatch(IP);
    return ip;
}

let direct: string;
const expected = expectedProxyIp();

test.beforeAll(async () => {
    direct = await directIp();
    console.log(`Direct IP:   ${direct}`);
    console.log(`Proxy:       ${process.env.ASM_PROXY_SERVER ?? "(no --proxyServer)"}`);
    console.log(`Expected IP: ${expected ?? "(unknown - only checking it differs from the direct IP)"}`);
});

for (const scheme of ["https", "http"]) {
    test(`${scheme}: ipify sees the proxy's IP`, async ({page}) => {
        const ip = await browserIp(page, `${scheme}://${IPIFY}`);
        console.log(`${scheme.toUpperCase()} via browser: ${ip}`);

        expect(ip, "the request did not go through the proxy").not.toBe(direct);
        if (expected) expect(ip).toBe(expected);
    });
}
