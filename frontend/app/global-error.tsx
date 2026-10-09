"use client";

/**
 * Last resort when the root layout itself fails: renders its own document,
 * without the site's CSS, so the colours are inline.
 */
export default function GlobalError({
  error,
  retry,
}: Readonly<{ error: Error & { digest?: string }; retry: () => void }>) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e0f10",
          color: "#ededeb",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
          padding: 16,
        }}
      >
        <title>Ошибка — VEINMusic</title>
        <main role="alert" style={{ maxWidth: 420 }}>
          <p style={{ fontSize: 48, color: "#80848c", margin: 0 }}>:(</p>
          <h1 style={{ fontSize: 20, margin: "12px 0 8px" }}>
            VEINMusic не загрузился
          </h1>
          <p style={{ fontSize: 14, color: "#a9acb2", lineHeight: 1.5 }}>
            Попробуйте ещё раз через минуту.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#80848c" }}>
              Если ошибка повторяется, напишите нам и приложите код:{" "}
              <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 12,
              padding: "10px 18px",
              border: 0,
              borderRadius: 8,
              background: "#e3a93b",
              color: "#121212",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Попробовать ещё раз
          </button>
        </main>
      </body>
    </html>
  );
}
