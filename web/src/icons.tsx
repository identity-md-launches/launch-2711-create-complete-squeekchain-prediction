import type { CSSProperties } from 'react';
type Name = 'arrow' | 'wheel' | 'clock' | 'check' | 'close' | 'refresh' | 'external' | 'wallet' | 'plus' | 'search' | 'info' | 'chevron' | 'chart' | 'trophy' | 'moon' | 'bolt' | 'ticket';
const paths: Record<Name, React.ReactNode> = {
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  wheel: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="m12 3 0 7m2 2h7m-9 2v7m-2-9H3m2.6-6.4 5 5m2.8 2.8 5 5m0-12.8-5 5m-2.8 2.8-5 5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 11-1l3 6M4 12l3 6a7 7 0 0 0 11-1"/></>,
  external: <><path d="M14 3h7v7m-9 2 9-9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></>,
  wallet: <><path d="M20 8V5a2 2 0 0 0-2-2L4 6v13a2 2 0 0 0 2 2h14V8H4"/><path d="M20 12h-5v5h5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  chevron: <path d="m8 5 7 7-7 7"/>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4M12 13v4m-4 3h8"/></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>,
  bolt: <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>,
  ticket: <><path d="M4 7a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4V7Z"/><path d="M10 9h4m-4 3h4m-4 3h4"/></>, chart: <><path d="M4 4v16h16M8 15v-4m4 4V7m4 8v-6"/></>,
};
export function Icon({ name, size = 20, className, style }: { name: Name; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name]}</svg>;
}
