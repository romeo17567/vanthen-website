const http = require("http");
const crypto = require("crypto");

const PREFIX = "VANTHEN_TIKTOK_TOKEN:";

function createTikTokOAuth(options) {
  const {
    client,
    guildId,
    botToken,
    clientKey,
    clientSecret,
    redirectUri,
    ensureStateChannel,
    onConnected
  } = options;

  const states = new Map();

  function keyBuffer() {
    return crypto.createHash("sha256")
      .update(String(botToken) + "|" + String(clientSecret) + "|VANTHEN_TIKTOK")
      .digest();
  }

  function encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer(), iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return [iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
  }

  function decrypt(payload) {
    const [ivRaw, tagRaw, dataRaw] = String(payload || "").split(".");
    if (!ivRaw || !tagRaw || !dataRaw) return null;

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      keyBuffer(),
      Buffer.from(ivRaw, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataRaw, "base64url")),
      decipher.final()
    ]).toString("utf8");

    return JSON.parse(plain);
  }

  async function readStored(guild) {
    const channel = await ensureStateChannel(guild);
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return { channel, message: null, token: null };

    const message = messages.find(
      m => m.author.id === client.user.id && m.content.startsWith(PREFIX)
    );

    if (!message) return { channel, message: null, token: null };

    try {
      return {
        channel,
        message,
        token: decrypt(message.content.slice(PREFIX.length))
      };
    } catch {
      return { channel, message, token: null };
    }
  }

  async function saveStored(guild, token) {
    const current = await readStored(guild);
    const content = PREFIX + encrypt(token);

    if (content.length > 1950) {
      throw new Error("TikTok Token ist zu lang für den internen Discord-Speicher.");
    }

    if (current.message) {
      await current.message.edit(content);
    } else {
      await current.channel.send(content);
    }
  }

  async function exchangeCode(code) {
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    });

    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
      throw new Error(data.error_description || data.error || "TikTok Token-Austausch fehlgeschlagen.");
    }

    return {
      ...data,
      expires_at: Date.now() + Number(data.expires_in || 86400) * 1000
    };
  }

  async function refreshToken(guild, token) {
    if (!token?.refresh_token) return token;

    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token
    });

    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
      throw new Error(data.error_description || data.error || "TikTok Token-Refresh fehlgeschlagen.");
    }

    const next = {
      ...token,
      ...data,
      expires_at: Date.now() + Number(data.expires_in || 86400) * 1000
    };

    await saveStored(guild, next);
    return next;
  }

  async function getAccessToken(guild) {
    const stored = await readStored(guild);
    let token = stored.token;

    if (!token?.access_token) return "";

    if (!token.expires_at || Number(token.expires_at) > Date.now() + 10 * 60 * 1000) {
      return token.access_token;
    }

    token = await refreshToken(guild, token);
    return token?.access_token || "";
  }

  function page(title, text, ok = false) {
    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
body{margin:0;background:#09090b;color:#fff;font-family:Arial,sans-serif;min-height:100vh;display:grid;place-items:center}
.card{width:min(680px,calc(100% - 40px));background:#16161a;border:1px solid #2d2d34;border-radius:18px;padding:28px;box-sizing:border-box}
h1{margin-top:0}.ok{color:#86efac}.muted{color:#aaa}a{color:#fff}
</style>
</head>
<body><main class="card"><h1>${title}</h1><p class="${ok ? "ok" : ""}">${text}</p><p class="muted">VANTHEN • NOT MADE TO BELONG.</p></main></body></html>`;
  }

  function startServer() {
    const port = Number(process.env.PORT || 3000);

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", redirectUri || `http://localhost:${port}`);

        if (url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          return res.end("ok");
        }

        if (url.pathname === "/tiktok/login") {
          if (!clientKey || !clientSecret || !redirectUri) {
            res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
            return res.end(page(
              "TikTok noch nicht bereit",
              "Client Key, Client Secret oder Redirect URI fehlt noch in Railway."
            ));
          }

          const state = crypto.randomBytes(24).toString("hex");
          states.set(state, Date.now() + 10 * 60 * 1000);

          const auth = new URL("https://www.tiktok.com/v2/auth/authorize/");
          auth.searchParams.set("client_key", clientKey);
          auth.searchParams.set("response_type", "code");
          auth.searchParams.set("scope", "user.info.basic,video.list");
          auth.searchParams.set("redirect_uri", redirectUri);
          auth.searchParams.set("state", state);

          res.writeHead(302, { Location: auth.toString() });
          return res.end();
        }

        if (url.pathname === "/tiktok/callback") {
          const error = url.searchParams.get("error");
          if (error) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            return res.end(page(
              "TikTok-Verbindung fehlgeschlagen",
              url.searchParams.get("error_description") || error
            ));
          }

          const code = url.searchParams.get("code") || "";
          const state = url.searchParams.get("state") || "";
          const expires = states.get(state) || 0;
          states.delete(state);

          if (!code || !state || expires < Date.now()) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            return res.end(page(
              "TikTok-Verbindung abgelaufen",
              "Bitte starte die Verbindung erneut über /tiktok/login."
            ));
          }

          const token = await exchangeCode(code);
          const guild = await client.guilds.fetch(guildId);
          await saveStored(guild, token);

          if (typeof onConnected === "function") {
            await onConnected(guild).catch(() => null);
          }

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          return res.end(page(
            "TikTok verbunden ✅",
            "Dein VANTHEN TikTok-Konto ist jetzt mit dem Discord-Bot verbunden. Du musst keinen Token kopieren oder einfügen.",
            true
          ));
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(page(
          "VANTHEN Social Bot",
          '<a href="/tiktok/login">TikTok jetzt verbinden</a>'
        ));
      } catch (err) {
        console.error("TikTok OAuth Server:", err);
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(page(
          "TikTok-Verbindung fehlgeschlagen",
          "Beim Verbinden ist ein Fehler aufgetreten. Prüfe die Railway-Logs."
        ));
      }
    });

    server.listen(port, () => {
      console.log(`TikTok OAuth Server aktiv auf Port ${port}.`);
    });
  }

  return {
    startServer,
    getAccessToken
  };
}

module.exports = { createTikTokOAuth };
