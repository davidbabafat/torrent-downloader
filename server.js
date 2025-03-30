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
const PORT = process.env.PORT || 3000;

const frontendUrl = "https://torrent-downloader-5th2.onrender.com"; // Update if needed
const io = new Server(server, {
    cors: { origin: frontendUrl, methods: ["GET", "POST"] },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ✅ Ensure the "downloads" directory exists
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
                name: file.name,
                size: file.length,
                progress: 0,
                downloadLink: "#",
            }));

            io.emit("torrent-added", { folderName, files: filesInfo });

            // ✅ Track Progress Per File
            torrent.files.forEach(file => {
                file.downloaded = 0;

                const updateProgress = setInterval(() => {
                    let progress = ((file.downloaded / file.length) * 100).toFixed(2);
                    let downloadLink = progress >= 100
                        ? `/downloads/${encodeURIComponent(file.path)}`
                        : "#";

                    io.emit("progress", { folderName, file: { name: file.name, progress, downloadLink } });

                    if (progress >= 100) clearInterval(updateProgress);
                }, 1000);

                file.createReadStream().on("data", chunk => { file.downloaded += chunk.length; });
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
