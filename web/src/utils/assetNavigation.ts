// Return to a valid in-app source; never leave the app or revisit a removed detail.
export function assetReturnPath(asset: {id:string;type:string} | undefined, from: unknown, availableIds: string[]) {
  if (asset?.type === 'wish') return '/wish';
  if (typeof from === 'string') {
    const match = /^\/asset\/([a-f0-9]{32})$/.exec(from);
    if (match && match[1] !== asset?.id && availableIds.includes(match[1])) return from;
    if (from === '/' || from === '/wish') return from;
  }
  return '/';
}
