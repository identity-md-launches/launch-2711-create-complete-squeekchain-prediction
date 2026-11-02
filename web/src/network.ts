/* Public chain parameters from the pinned network input. */
export const network = {
  "chainId": 11155111,
  "name": "Sepolia",
  "testnet": true,
  "rpcUrls": [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc.sepolia.ethpandaops.io",
    "https://sepolia.rpc.sentio.xyz"
  ],
  "explorer": "https://sepolia.etherscan.io",
  "nativeCurrency": {
    "name": "Sepolia Ether",
    "symbol": "ETH",
    "decimals": 18
  }
} as const;
export const walletAddChain = {
  "chainId": "0xaa36a7",
  "chainName": "Sepolia",
  "rpcUrls": [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc.sepolia.ethpandaops.io",
    "https://sepolia.rpc.sentio.xyz"
  ],
  "nativeCurrency": {
    "name": "Sepolia Ether",
    "symbol": "ETH",
    "decimals": 18
  },
  "blockExplorerUrls": [
    "https://sepolia.etherscan.io"
  ]
} as const;
export const PREDICT_ADDRESS = "0x8bd658e58e94ab6a18a8b9d8c6108d1287facacf" as const;
