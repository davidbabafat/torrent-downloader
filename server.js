import express from "express";
import WebTorrent from "webtorrent";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

// ✅ **Download API - Adds Torrent & Sends Streamable Links**
app.post("/download", (req, res) => {
    const magnetURI = req.body.magnet;
    console.log("Received Magnet URI:", magnetURI);

    if (!magnetURI) {
        return res.status(400).json({ error: "No magnet link provided" });
    }

    client.add(magnetURI, (torrent) => {
        console.log("Torrent added:", torrent.infoHash);

        let folderName = torrent.name;
        let filesInfo = torrent.files.map(file => ({
            name: file.name,
            size: file.length,
            downloadLink: `/stream/${torrent.infoHash}/${encodeURIComponent(file.name)}`
        }));

        io.emit("torrent-added", { folderName, files: filesInfo });

        // ✅ **Track Download Progress**
        const interval = setInterval(() => {
            const progress = (torrent.progress * 100).toFixed(2);
            console.log(`Download progress: ${progress}%`);
            io.emit("progress", { type: "download", progress, folderName });

            // ✅ Stop interval if download is complete
            if (torrent.progress === 1) {
                clearInterval(interval);
            }
        }, 2000); // Every 2 seconds

        torrent.on("done", () => {
            console.log("All files downloaded!");
            io.emit("progress", { type: "done", folderName });
            clearInterval(interval); // Stop interval on completion
        });

        torrent.on("error", (err) => {
            console.error("Torrent error:", err.message);
            io.emit("progress", { type: "error", message: err.message });
            clearInterval(interval);
        });

        res.json({ success: true, folderName, files: filesInfo });
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
