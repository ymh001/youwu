/** Original filled navigation symbols, drawn on a shared 24px grid. */
export type NavigationIconName = "assets" | "wish" | "trend" | "settings";

export default function NavigationIcon({ name }: { name: NavigationIconName }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {name === "assets" && <>
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="13" y="3" width="8" height="8" rx="2" />
        <rect x="3" y="13" width="8" height="8" rx="2" />
        <rect x="13" y="13" width="8" height="8" rx="2" />
      </>}
      {name === "wish" && <path d="M12 21S2 14.8 2 8.2C2 5 4.2 3 7 3c2.1 0 3.8 1.1 5 3 1.2-1.9 2.9-3 5-3 2.8 0 5 2 5 5.2C22 14.8 12 21 12 21Z" />}
      {name === "trend" && <>
        <rect x="3" y="13" width="5" height="8" rx="1.4" />
        <rect x="9.5" y="8" width="5" height="13" rx="1.4" />
        <rect x="16" y="3" width="5" height="18" rx="1.4" />
      </>}
      {name === "settings" && <path fillRule="evenodd" d="M9.5 2h5l.6 2.5 1.4.8 2.5-.7 2.5 4.3-1.9 1.8v1.6l1.9 1.8-2.5 4.3-2.5-.7-1.4.8-.6 2.5h-5l-.6-2.5-1.4-.8-2.5.7L2.5 14l1.9-1.8v-1.6L2.5 8.8 5 4.5l2.5.7 1.4-.8L9.5 2Zm2.5 6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" clipRule="evenodd" />}
    </svg>
  );
}
