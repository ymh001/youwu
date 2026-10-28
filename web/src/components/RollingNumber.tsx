/** Keep formatting exact; only the visual digit columns move. */
export default function RollingNumber({ text }: { text: string }) {
  return (
    <span className="rolling-number" data-value={text}>
      <span className="rolling-accessible">{text}</span>
      <span className="rolling-visual" aria-hidden="true">
        {[...text].map((char, index) =>
          /[0-9]/.test(char) ? (
            <span
              className="rolling-digit"
              key={`digit-${text.length - index}`}
            >
              <span
                className="rolling-track"
                style={{ transform: `translateY(-${Number(char) * 1.12}em)` }}
              >
                {Array.from({ length: 10 }, (_, n) => (
                  <span key={n}>{n}</span>
                ))}
              </span>
            </span>
          ) : (
            <span key={`separator-${text.length - index}`}>{char}</span>
          ),
        )}
      </span>
    </span>
  );
}
