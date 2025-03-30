import express from "express";
import WebTorrent from "webtorrent";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const frontendUrl = "https://torrent-downloader-5th2.onrender.com"; // Update if needed
const io = new Server(server, {
    cors: {
        origin: frontendUrl,
        methods: ["GET", "POST"],
    },
});

const client = new WebTorrent();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Ensure the "downloads" directory exists
const DOWNLOADS_DIR = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR);
}

// ✅ **Root Route**
app.get("/", (req, res) => {
    res.send("Torrent Downloader Server is Running!");
});

// ✅ **Streaming Route for Direct Downloads**
app.get("/stream/:torrentId/:fileName", (req, res) => {
    const { torrentId, fileName } = req.params;
    console.log(`Streaming file from torrent: ${torrentId}, File: ${fileName}`);

    const torrent = client.get(torrentId);
    if (!torrent) {
        return res.status(404).json({ error: "Torrent not found" });
    }

    const file = torrent.files.find(f => f.name === fileName);
    if (!file) {
        return res.status(404).json({ error: "File not found" });
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
    
    const stream = file.createReadStream();
    stream.pipe(res);
});

// ✅ **Download API - Adds Torrent & Saves Files**
app.post("/download", (req, res) => {
    const magnetURI = req.body.magnet;
    console.log("Received Magnet URI:", magnetURI);

    if (!magnetURI) {
        return res.status(400).json({ error: "No magnet link provided" });
    }

    client.add(magnetURI, { path: DOWNLOADS_DIR }, (torrent) => {
        console.log("Torrent added:", torrent.infoHash);

        let folderName = torrent.name;
        let filesInfo = torrent.files.map(file => ({
            name: file.name,
            size: file.length,
            downloadLink: `/downloads/${encodeURIComponent(file.name)}`,
        }));

        io.emit("torrent-added", { folderName, files: filesInfo });

        // ✅ Emit progress updates
        torrent.on("download", () => {
            const progress = (torrent.progress * 100).toFixed(2);
            console.log(`Download progress: ${progress}%`);
            io.emit("progress", { type: "download", progress, folderName });
        });

        // ✅ Once complete, files will be available for direct download
        torrent.on("done", () => {
            console.log("All files downloaded!");
            io.emit("progress", { type: "done", folderName });
        });

        torrent.on("error", (err) => {
            console.error("Torrent error:", err.message);
            io.emit("progress", { type: "error", message: err.message });
        });

        res.json({ success: true, files: filesInfo });
    });
});

// ✅ **Serve Downloaded Files for IDM**
app.use("/downloads", express.static(DOWNLOADS_DIR));

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
