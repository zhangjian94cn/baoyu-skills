import nodeFetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";

const proxyUrl = process.env.ALL_PROXY || "socks5://127.0.0.1:1080";
console.log(`Using proxy: ${proxyUrl}`);

const agent = new SocksProxyAgent(proxyUrl);

try {
  console.log("Connecting to api.ipify.org...");
  const response = await nodeFetch("https://api.ipify.org?format=json", { agent });
  const data = await response.json();
  console.log(`Your IP via proxy: ${JSON.stringify(data)}`);
} catch (error: any) {
  console.error(`Error: ${error.message}`);
  if (error.cause) console.error(`Cause: ${error.cause}`);
}
