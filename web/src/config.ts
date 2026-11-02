import { createConfig, http } from 'wagmi';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { createPublicClient, defineChain, fallback } from 'viem';
import { network, PREDICT_ADDRESS } from './network';

export { PREDICT_ADDRESS };
export const chain = defineChain({
  id: network.chainId, name: network.name,
  nativeCurrency: network.nativeCurrency,
  rpcUrls: { default: { http: [...network.rpcUrls] } },
  blockExplorers: { default: { name: 'Etherscan', url: network.explorer } }, testnet: true,
});
const transport = () => fallback(network.rpcUrls.map(url => http(url, { timeout: 7000, retryCount: 0 })), { retryCount: 0 });
export const publicClient = createPublicClient({ chain, transport: transport() });
export const config = createConfig({
  chains: [chain], multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: 'Squeek Predict' })],
  transports: { [chain.id]: transport() },
});
export const EXPLORER = network.explorer;
