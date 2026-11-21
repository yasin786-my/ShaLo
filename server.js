const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");

const app = express();
const PORT = 3000;
const shared = path.join(__dirname, "shared");

fs.mkdirSync(shared, { recursive: true });

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
const metaFile = path.join(__dirname, "meta.json");
let meta = {};
try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch {}
const saveMeta = () => fs.writeFile(metaFile, JSON.stringify(meta), () => {});

function sender(req) {
    let name = "Device";
    try { name = decodeURIComponent(req.headers["x-device-name"] || "") || name; } catch {}
    return {
        id: String(req.headers["x-device-id"] || "").slice(0, 32),
        name: name.slice(0, 40)
    };
}

const displayName = name => name.replace(/^\d{13}-/, "");

// The ShaLo interface
app.use(express.static(path.join(__dirname, "public")));

// Downloads: serves the shared folder and saves files under their original name
app.use("/files", express.static(shared, {
    setHeaders: (res, filePath) => res.attachment(displayName(path.basename(filePath)))
}));

// List shared files, newest first
app.get("/api/files", (req, res) => {
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

// Addresses other devices on the Wi-Fi can open
app.get("/api/info", (req, res) => {
    const urls = Object.values(os.networkInterfaces()).flat()
        .filter(i => i && i.family === "IPv4" && !i.internal)
        .map(i => `http://${i.address}:${PORT}`);
    res.json({ urls });
});

// Upload one or more files into the shared folder
app.post("/upload", upload.array("files", 50), (req, res) => {
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
    res.status(500).json({ error: "Upload failed. Check the device running ShaLo and try again." });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`ShaLo is running. Open it from any device on this network:`);
    Object.values(os.networkInterfaces()).flat()
        .filter(i => i && i.family === "IPv4" && !i.internal)
        .forEach(i => console.log(`  http://${i.address}:${PORT}`));
});
