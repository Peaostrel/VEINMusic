if (window.location.hash.includes('access_token=')) {
    window.stop();
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    
    if (token) {
        document.documentElement.innerHTML = `
            <head>
                <title>VEIN | Авторизация Яндекс</title>
                <meta charset="utf-8">
                <style>
                    body { margin: 0; background: #121212; color: white; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
                    .card { background: #1a1a1a; padding: 40px; border-radius: 24px; border: 1px solid rgba(255,204,0,0.3); text-align: center; box-shadow: 0 0 50px rgba(255,204,0,0.1); max-width: 420px; width: 90%; position: relative; overflow: hidden; }
                    .glow { position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,204,0,0.1) 0%, transparent 60%); pointer-events: none; z-index: 0; }
                    .content { position: relative; z-index: 1; }
                    .icon { font-size: 64px; margin-bottom: 10px; drop-shadow: 0 0 20px rgba(255,204,0,0.5); }
                    h1 { font-weight: 900; margin: 10px 0; color: #ffffff; font-size: 28px; }
                    .highlight { color: #ffcc00; }
                    p { color: #a0a0a0; margin-bottom: 30px; line-height: 1.6; font-weight: 500; }
                    .token-box { background: #000; padding: 12px; border-radius: 12px; font-family: monospace; font-size: 11px; color: #555; word-break: break-all; margin-bottom: 30px; border: 1px solid #333; box-shadow: inset 0 0 10px rgba(0,0,0,0.5); user-select: all; }
                    button { background: linear-gradient(to right, #ffcc00, #ffaa00); color: #121212; border: none; padding: 16px 32px; border-radius: 12px; font-size: 16px; font-weight: 900; cursor: pointer; transition: all 0.2s; box-shadow: 0 0 20px rgba(255,204,0,0.4); width: 100%; }
                    button:hover { transform: scale(1.05); box-shadow: 0 0 30px rgba(255,204,0,0.6); }
                    button:active { transform: scale(0.95); }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="glow"></div>
                    <div class="content">
                        <div class="icon">🔑</div>
                        <h1>Токен <span class="highlight">получен</span></h1>
                        <p>Авторизация Яндекса прошла успешно. Теперь просто нажми кнопку ниже, чтобы скопировать токен и вернуться в настройки.</p>
                        <div class="token-box" id="token-text">${window.location.href}</div>
                        <button id="copy-btn">Скопировать и закрыть</button>
                    </div>
                </div>
                <script>
                    document.getElementById('copy-btn').addEventListener('click', () => {
                        navigator.clipboard.writeText(document.getElementById('token-text').innerText).then(() => {
                            document.getElementById('copy-btn').innerText = 'Скопировано! Закрой вкладку';
                            document.getElementById('copy-btn').style.background = '#1DB954';
                        });
                    });
                </script>
            </body>
        `;
    }
}