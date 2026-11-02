import { useState } from 'react';
import { getAddress } from 'viem';
import { useConnection, useConnect, useConnectors, useDisconnect, useSwitchChain } from 'wagmi';
import { chain } from './config';
import { friendlyError } from './model';
import { Icon } from './icons';
import { Modal } from './Modal';
import { isMobileBrowser, OPEN_IN } from './open-in';
export const shortAddress = (a: string) => `${getAddress(a).slice(0, 6)}…${getAddress(a).slice(-4)}`;
export function Wallet({ open, setOpen }: { open: boolean; setOpen: (value: boolean) => void }) {
  const { address, isConnected, chainId } = useConnection();
  const { mutateAsync: connect, isPending, variables } = useConnect();
  const connectors = useConnectors();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChain, isPending: switching } = useSwitchChain();
  const [error, setError] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const mobile = isMobileBrowser();
  const named = connectors.some(c => c.type === 'injected' && c.id !== 'injected');
  const listed = [...connectors.filter(c => c.type === 'injected'), ...connectors.filter(c => c.type !== 'injected')].filter(c => !(c.id === 'injected' && named) && (!mobile || c.type !== 'injected'));
  const wrong = isConnected && chainId !== chain.id;
  async function switchNetwork() {
    setError('');
    try { await switchChain({ chainId: chain.id }); } catch (e) { setError(friendlyError(e)); setAccountOpen(true); }
  }
  return <>
    <button className="wallet-button" onClick={() => { setError(''); if (wrong) void switchNetwork(); else if (isConnected) setAccountOpen(true); else setOpen(true); }}>
      <Icon name="wallet" size={18}/><span>{switching ? 'Switching…' : wrong ? 'Switch to Sepolia' : address ? shortAddress(address) : 'Connect wallet'}</span>
    </button>
    {open && !isConnected && <Modal title="Connect a wallet" onClose={() => setOpen(false)} className="wallet-modal">
      <p className="muted">Use Sepolia test ETH to make your prediction.</p>
      <div className="wallet-list">
        {mobile && OPEN_IN.map(w => <a className="wallet-row" key={w.id} href={w.href(location.href)}><img src={`./marks/${w.id}.svg`} alt="" width="28" height="28"/><span>Open in {w.name}</span><Icon name="external" size={18}/></a>)}
        {listed.map(c => <button key={c.uid} className="wallet-row" disabled={isPending} onClick={async () => { setError(''); try { await connect({ connector: c }); setOpen(false); } catch (e) { setError(c.id === 'injected' && !(window as Window & { ethereum?: unknown }).ethereum ? 'No browser wallet found. Install a wallet extension or choose Coinbase Wallet.' : friendlyError(e)); } }}>
          {c.icon ? <img src={c.icon} alt="" width="28" height="28"/> : c.id === 'coinbaseWalletSDK' ? <img src="./marks/coinbase.svg" alt="" width="28" height="28"/> : <Icon name="wallet" size={28}/>}
          <span>{c.id === 'injected' ? 'Browser wallet' : c.id === 'coinbaseWalletSDK' ? mobile ? 'Coinbase Smart Wallet' : 'Coinbase Wallet' : c.name}{isPending && variables?.connector === c ? ' · opening…' : ''}</span><Icon name="chevron" size={18}/>
        </button>)}
      </div>
      <p className="wallet-notice" role="status">{error}</p>
      <p className="caption muted">Connecting never places a bet. Every transaction needs your approval.</p>
    </Modal>}
    {accountOpen && address && <Modal title="Your wallet" onClose={() => setAccountOpen(false)}>
      <p className="caption muted">{wrong ? 'Switch to Sepolia to place bets or claim.' : 'Connected to Sepolia'}</p><p className="address">{getAddress(address)}</p>
      {wrong && <button className="primary full" onClick={() => void switchNetwork()} disabled={switching}>{switching ? 'Switching…' : 'Switch to Sepolia'}</button>}
      <a className="button secondary full" href={`${chain.blockExplorers.default.url}/address/${address}`} target="_blank" rel="noreferrer">View wallet on Etherscan<Icon name="external" size={16}/></a>
      <button className="secondary full" onClick={() => { disconnect(); setAccountOpen(false); }}>Disconnect</button><p className="wallet-notice" role="status">{error}</p>
    </Modal>}
  </>;
}
