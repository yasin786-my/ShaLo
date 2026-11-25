const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const app = express();
const PORT = 3000;
const SESSION_MS = 12 * 60 * 60 * 1000;   // how long a joined device stays signed in
const INVITE_MS = 2 * 60 * 1000;          // how long a join code works
// ShaLo Android: the app passes SHALO_DATA (a folder that survives app updates). On a PC it falls back to this folder.
const DATA = process.env.SHALO_DATA || __dirname;
const shared = path.join(DATA, "shared");

fs.mkdirSync(shared, { recursive: true });
app.disable("x-powered-by");

// ---------- Security headers ----------
app.use((req, res, next) => {
    res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
    });
    next();
});
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// ---------- Who is allowed in ----------
const sessions = new Map();   // session token -> expiry time
const tries = new Map();      // ip -> failed-join counter
let invite = null;            // { code, expires }: one join code at a time, single use
let joined = 0;

const ipOf = req => (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
// ShaLo Android: os.networkInterfaces() is blocked for Node on Android 11+, so the app writes ips.json for us.
const lanIps = () => {
    try {
        return Object.values(os.networkInterfaces()).flat()
            .filter(i => i && i.family === "IPv4" && !i.internal).map(i => i.address);
    } catch {}
    try { return JSON.parse(fs.readFileSync(path.join(DATA, "ips.json"), "utf8")); } catch { return []; }
};
const lanUrls = () => lanIps().map(ip => `http://${ip}:${PORT}`);

// The device running ShaLo is trusted; every other device must join with a code
const isHost = req => {
    const ip = ipOf(req);
    return ip === "127.0.0.1" || ip === "::1" || lanIps().includes(ip);
};
const cookieOf = (req, name) => {
    const c = (req.headers.cookie || "").split(/;\s*/).find(p => p.startsWith(name + "="));
    return c ? c.slice(name.length + 1) : "";
};
const authed = req => {
    if (isHost(req)) return true;
    const t = cookieOf(req, "shalo_session");
    const exp = sessions.get(t);
    if (exp && exp > Date.now()) return true;
    sessions.delete(t);
    return false;
};
// Browsers opening a link get the code page; apps and scripts get a JSON error
const requireAuth = (req, res, next) => {
    if (authed(req)) return next();
    if ((req.headers.accept || "").includes("text/html")) {
        res.set("Cache-Control", "no-store");
        return res.status(401).sendFile(path.join(__dirname, "public", "join.html"));
    }
    res.status(401).json({ error: "Join ShaLo with a code first." });
};
const requireHost = (req, res, next) =>
    isHost(req) ? next() : res.status(403).json({ error: "Only the device running ShaLo can do this." });
// Blocks other websites from sending requests to ShaLo through your browser
const sameOrigin = (req, res, next) => {
    const o = req.headers.origin;
    if (o) {
        try { if (new URL(o).host !== req.headers.host) throw 0; }
        catch { return res.status(403).json({ error: "Blocked a request from another site." }); }
    }
    next();
};
// At most 8 join attempts per minute from one device
const tooMany = req => {
    const ip = ipOf(req), now = Date.now();
    let t = tries.get(ip);
    if (!t || t.reset < now) t = { n: 0, reset: now + 60000 };
    t.n++; tries.set(ip, t);
    return t.n > 8;
};
const currentInvite = () => {
    if (!invite || invite.expires <= Date.now()) {
        invite = { code: String(crypto.randomInt(0, 1000000)).padStart(6, "0"), expires: Date.now() + INVITE_MS };
    }
    return invite;
};
// A code works once: using it deletes it
const redeem = code => {
    if (!invite || invite.expires <= Date.now() || !/^\d{6}$/.test(code)) return null;
    if (!crypto.timingSafeEqual(Buffer.from(code), Buffer.from(invite.code))) return null;
    invite = null; joined++;
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, Date.now() + SESSION_MS);
    return token;
};
const startSession = (res, token) =>
    res.cookie("shalo_session", token, { httpOnly: true, sameSite: "strict", maxAge: SESSION_MS });

setInterval(() => {
    const now = Date.now();
    sessions.forEach((exp, t) => { if (exp <= now) sessions.delete(t); });
    tries.forEach((v, ip) => { if (v.reset <= now) tries.delete(ip); });
}, 10 * 60 * 1000).unref();

// ---------- Pages ----------
app.get("/", (req, res, next) =>
    authed(req) ? next() : res.sendFile(path.join(__dirname, "public", "join.html")));
app.use(express.static(path.join(__dirname, "public")));

// Scanning the QR code lands here
app.get("/join", (req, res) => {
    if (tooMany(req)) return res.status(429).send("Too many tries. Wait a minute and try again.");
    const token = redeem(String(req.query.code || ""));
    if (!token) return res.redirect("/?expired=1");
    startSession(res, token);
    res.redirect("/");
});

// Typing the 6-digit code lands here
app.post("/api/join", sameOrigin, express.json({ limit: "1kb" }), (req, res) => {
    if (tooMany(req)) return res.status(429).json({ error: "Too many tries. Wait a minute and try again." });
    const token = redeem(String((req.body && req.body.code) || ""));
    if (!token) return res.status(401).json({ error: "That code didn't work. It may have expired." });
    startSession(res, token);
    res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => res.json({ host: isHost(req) }));

// Host only: the current join code. A fresh one appears as soon as it is used or expires.
app.get("/api/invite", requireHost, (req, res) => {
    const i = currentInvite();
    res.json({ code: i.code, ttl: Math.max(0, Math.round((i.expires - Date.now()) / 1000)), joined, urls: lanUrls() });
});

// Host only: delete the code when the Add a device window closes
app.delete("/api/invite", requireHost, sameOrigin, (req, res) => {
    invite = null;
    res.json({ ok: true });
});

// Host only: sign every other device out
app.post("/api/revoke", requireHost, sameOrigin, (req, res) => {
    sessions.clear(); invite = null;
    res.json({ ok: true });
});

// ---------- Files ----------
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, shared),
        filename: (req, file, cb) => {
            const name = path.basename(file.originalname).replace(/[^\w.\- ]/g, "_");
            cb(null, Date.now() + "-" + name);
        }
    }),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

// Remembers which device sent each file
const metaFile = path.join(DATA, "meta.json");
let meta = {};
try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch {}
const saveMeta = () => fs.writeFile(metaFile, JSON.stringify(meta), () => {});
function sender(req) {
    let name = "Device";
    try { name = decodeURIComponent(req.headers["x-device-name"] || "") || name; } catch {}
    return { id: String(req.headers["x-device-id"] || "").slice(0, 32), name: name.slice(0, 40) };
}
const displayName = name => name.replace(/^\d{13}-/, "");

// Only these safe types can open inside the browser. Everything else (HTML, SVG, scripts...)
// can only be downloaded, so a shared file can never run code in the page.
const VIEWABLE = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".avif": "image/avif", ".bmp": "image/bmp",
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
    ".csv": "text/plain; charset=utf-8", ".json": "text/plain; charset=utf-8", ".log": "text/plain; charset=utf-8"
};
app.get("/view/:id", requireAuth, (req, res) => {
    const id = req.params.id;
    if (id !== path.basename(id) || id.startsWith(".")) return res.status(404).send("Not found.");
    const type = VIEWABLE[path.extname(id).toLowerCase()];
    if (!type) return res.status(415).send("This file type can't open in the browser. Download it instead.");
    const file = path.join(shared, id);
    if (!fs.existsSync(file)) return res.status(404).send("Not found.");
    const headers = {
        "Content-Type": type,
        "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(displayName(id)),
        "X-Content-Type-Options": "nosniff"
    };
    // Sandbox everything except PDF (the browser's PDF viewer doesn't work inside a sandbox)
    if (type !== "application/pdf") {
        headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'";
    }
    res.set(headers);
    res.sendFile(file, { dotfiles: "deny" });
});

// Downloads always save as a file; they never open inside the browser
app.use("/files", requireAuth, express.static(shared, {
    dotfiles: "deny",
    setHeaders: (res, filePath) => res.attachment(displayName(path.basename(filePath)))
}));

app.get("/api/files", requireAuth, (req, res) => {
    const files = fs.readdirSync(shared)
        .map(name => ({ name, stat: fs.statSync(path.join(shared, name)) }))
        .filter(f => f.stat.isFile())
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
        .map(f => ({
            id: f.name,
            name: displayName(f.name),
            size: f.stat.size,
            modified: f.stat.mtimeMs,
            from: meta[f.name] || null,
            url: "/files/" + encodeURIComponent(f.name)
        }));
    res.json(files);
});

app.post("/upload", requireAuth, sameOrigin, upload.array("files", 50), (req, res) => {
    if (!req.files || !req.files.length) {
        return res.status(400).json({ error: "Choose at least one file to send." });
    }
    const from = sender(req);
    req.files.forEach(f => { meta[f.filename] = from; });
    saveMeta();
    res.json({ files: req.files.map(f => ({ name: f.originalname, size: f.size })) });
});

app.use((err, req, res, next) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "This file is over the 2 GB limit." });
    }
    res.status(500).json({ error: "Something went wrong. Try again." });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("ShaLo is running.");
    console.log("On this device, open: http://localhost:" + PORT);
    console.log("Other devices join with a code from the Add a device button, or from this address:");
    lanUrls().forEach(u => console.log("  " + u));
});
