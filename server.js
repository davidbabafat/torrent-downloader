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
const client = new WebTorrent();
const PORT = process.env.PORT || 10000;

const frontendUrl = "https://torrent-downloader-zjp4.onrender.com";
const io = new Server(server, {
    cors: { origin: frontendUrl, methods: ["GET", "POST"] },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Ensure the "downloads" directory exists
const DOWNLOADS_DIR = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR);
}

// ✅ Root Route
app.get("/", (req, res) => res.send("Torrent Downloader Server is Running!"));

// ✅ API to Add Torrent
app.post("/download", (req, res) => {
    const magnetURI = req.body.magnet;
    console.log("Received Magnet URI:", magnetURI);

    if (!magnetURI) return res.status(400).json({ error: "No magnet link provided" });

    try {
        client.add(magnetURI, { path: DOWNLOADS_DIR }, (torrent) => {
            console.log("Torrent added:", torrent.name);
            let folderName = torrent.name;

            let filesInfo = torrent.files.map(file => ({
                name: file.name || "Unknown File",
                size: file.length || 0,
                progress: 0,
                downloadLink: "#",
            }));

            io.emit("torrent-added", { folderName, files: filesInfo });

            // ✅ Track Progress
            torrent.on("download", () => {
                let progress = (torrent.progress * 100).toFixed(2);
                const FILES_BASE_URL = "https://torrent-downloader-zjp4.onrender.com/downloads/";

                let filesStatus = torrent.files.map(file => ({
                    name: file.name || "Unknown File",
                    progress: file.length ? ((file.downloaded || 0) / file.length * 100).toFixed(2) : "0",
                    downloadLink: file.downloaded >= file.length
                        ? `${FILES_BASE_URL}${encodeURIComponent(file.path)}`
                        : "#",
                }));

                io.emit("progress", { folderName, progress, files: filesStatus });
            });

            torrent.on("done", () => console.log("All files downloaded!"));
            torrent.on("error", err => console.error("Torrent error:", err.message));

            res.json({ success: true });
        });
    } catch (error) {
        console.error("Error adding torrent:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ✅ Serve Downloaded Files
app.use("/downloads", express.static(DOWNLOADS_DIR));

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
