import type { MarketArt as Art } from "./catalog";

export function MarketArt({ art, color }: { art: Art; color: string }) {
  return (
    <span className={`market-art art-${color}`} aria-hidden="true">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {art === "hamster" ? (
          <>
            <path
              d="M13 18c-9-11 5-15 8-5m14 5c9-11-5-15-8-5"
              fill="currentColor"
              fillOpacity=".22"
            />
            <path
              d="M9 28c0-10 6-16 15-16s15 6 15 16c0 10-8 14-15 14S9 38 9 28Z"
              fill="currentColor"
              fillOpacity=".2"
            />
            <path d="M18 25h.1M30 25h.1" strokeWidth="4" />
            <path d="m22 31 2 2 2-2m-2 2v4m-6-3-5-1m17 1 5-1" />
            <path d="M14 30h4m12 0h4" opacity=".5" />
          </>
        ) : art === "blocks" ? (
          <>
            <path
              d="m24 5 13 7-13 7-13-7 13-7Zm-13 7v14l13 7 13-7V12M24 19v14"
              fill="currentColor"
              fillOpacity=".16"
            />
            <path
              d="m7 27-4 2 13 7v8l13-7v-4m-13 3 8-4m13-8 8 4v8l-13 7-8-4m13-7 8-4m-8 4v7"
              opacity=".65"
            />
          </>
        ) : art === "bolt" ? (
          <path
            d="M27 4 10 27h12l-2 17 18-25H26l1-15Z"
            fill="currentColor"
            fillOpacity=".2"
          />
        ) : art === "moon" ? (
          <>
            <path
              d="M32 7a18 18 0 1 0 9 26C22 38 13 20 23 6"
              fill="currentColor"
              fillOpacity=".18"
            />
            <path d="M35 6v8m-4-4h8m-1 10v4m-2-2h4" />
          </>
        ) : art === "chart" ? (
          <>
            <path d="M7 7v34h35" />
            <path d="M14 31V21h6v10m6 0V14h6v17m6 0V7" strokeWidth="4" />
            <path d="m12 15 8-6 7 2 9-7" opacity=".5" />
          </>
        ) : (
          <>
            <circle
              cx="24"
              cy="23"
              r="17"
              fill="currentColor"
              fillOpacity=".12"
            />
            <circle cx="24" cy="23" r="4" />
            <path d="M24 6v13m4 4h13M24 27v13M7 23h13m-8-12 9 9m6 6 9 9m0-24-9 9m-6 6-9 9M18 43h12" />
          </>
        )}
      </svg>
    </span>
  );
}
