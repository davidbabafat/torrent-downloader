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

// ✅ **Download API - Adds Torrent & Tracks Progress**
app.post("/download", (req, res) => {
    const magnetURI = req.body.magnet;
    console.log("Received Magnet URI:", magnetURI);

    if (!magnetURI) {
        return res.status(400).json({ error: "No magnet link provided" });
    }

    client.add(magnetURI, { path: DOWNLOADS_DIR }, (torrent) => {
        console.log("Torrent added:", torrent.infoHash);
        let folderName = torrent.name;

        // Initial file list with 0% progress
        let filesInfo = torrent.files.map(file => ({
            name: file.name,
            size: file.length,
            progress: 0, // Start with 0%
            downloadLink: "#", // Initially disabled
        }));

        io.emit("torrent-added", { folderName, files: filesInfo });

        // ✅ Emit per-file progress updates
        const updateFileProgress = () => {
            let updatedFiles = torrent.files.map(file => ({
                name: file.name,
                size: file.length,
                progress: ((file.downloaded / file.length) * 100).toFixed(2), // File-specific progress
                downloadLink: file.downloaded === file.length 
                    ? `/downloads/${encodeURIComponent(file.name)}` // Enable link when done
                    : "#", // Otherwise, keep disabled
            }));

            io.emit("progress", { folderName, files: updatedFiles });
        };

        torrent.on("download", updateFileProgress);

        // ✅ Once complete, update UI with full links
        torrent.on("done", () => {
            console.log("All files downloaded!");
            updateFileProgress();
            io.emit("progress", { type: "done", folderName });
        });

        torrent.on("error", (err) => {
            console.error("Torrent error:", err.message);
            io.emit("progress", { type: "error", message: err.message });
        });

        res.json({ success: true });
    });
});

// ✅ **Serve Downloaded Files for IDM**
app.use("/downloads", express.static(DOWNLOADS_DIR));

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
