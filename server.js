import express from "express";
import WebTorrent from "webtorrent";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const frontendUrl = "https://torrent-downloader-5th2.onrender.com";
const io = new Server(server, {
  cors: {
    origin: frontendUrl,
    methods: ["GET", "POST"],
  },
});

const client = new WebTorrent();
const PORT = process.env.PORT || 3000;
const DOWNLOADS_FOLDER = path.join(__dirname, "downloads");

// Create downloads folder if not exists
if (!fs.existsSync(DOWNLOADS_FOLDER)) {
    fs.mkdirSync(DOWNLOADS_FOLDER);
}

app.use(cors());
app.use(express.json());
app.use(express.static(DOWNLOADS_FOLDER)); // Serve static files from downloads

// ✅ **Download API - Adds Torrent & Sends Streamable Links**
app.post("/download", (req, res) => {
    const magnetURI = req.body.magnet;
    console.log("Received Magnet URI:", magnetURI);

    if (!magnetURI) {
        return res.status(400).json({ error: "No magnet link provided" });
    }

    client.add(magnetURI, { path: DOWNLOADS_FOLDER }, (torrent) => {
        console.log("Torrent added:", torrent.infoHash);

        let folderName = torrent.name;
        let filesInfo = torrent.files.map(file => ({
            name: file.name,
            size: file.length,
            downloadLink: `/downloads/${encodeURIComponent(folderName)}/${encodeURIComponent(file.name)}`
        }));

        io.emit("torrent-added", { folderName, files: filesInfo });

        torrent.on("download", () => {
            const progress = (torrent.progress * 100).toFixed(2);
            console.log(`Downloading: ${folderName} - ${progress}%`);
            io.emit("progress", { type: "download", progress, folderName });
        });

        torrent.on("done", () => {
            console.log(`Download Complete: ${folderName}`);
            io.emit("progress", { type: "done", folderName });

            // Move files to a proper download directory (optional)
            let downloadedFiles = torrent.files.map(file => ({
                name: file.name,
                size: file.length,
                downloadLink: `http://localhost:${PORT}/downloads/${encodeURIComponent(folderName)}/${encodeURIComponent(file.name)}`
            }));

            res.json({ success: true, folderName, files: downloadedFiles });
        });

        torrent.on("error", (err) => {
            console.error("Torrent error:", err.message);
            io.emit("progress", { type: "error", message: err.message });
        });
    });
});

// ✅ **Serve Files After Download is Complete**
app.use("/downloads", express.static(DOWNLOADS_FOLDER));

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
