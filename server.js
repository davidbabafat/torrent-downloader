import express from "express";
import WebTorrent from "webtorrent";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Use the Render URL for CORS origin
const frontendUrl = "https://torrent-downloader-5th2.onrender.com"; // Your frontend URL
const io = new Server(server, {
  cors: {
    origin: frontendUrl,
    methods: ["GET", "POST"],
  },
});

const client = new WebTorrent();
const PORT = process.env.PORT || 3000;
const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use("/downloads", express.static(DOWNLOADS_DIR));

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const TRACKERS = [
  "udp://tracker.openbittorrent.com:80",
  "udp://tracker.opentrackr.org:1337",
  "udp://tracker.coppersurfer.tk:6969",
  "udp://tracker.leechers-paradise.org:6969",
  "udp://tracker.internetwarriors.net:1337",
  "udp://exodus.desync.com:6969",
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.fastcast.nz",
  "wss://tracker.webtorrent.dev",
];

app.post("/download", (req, res) => {
  const magnetURI = req.body.magnet;
  console.log("Received Magnet URI:", magnetURI);

  if (!magnetURI) {
    return res.status(400).json({ error: "No magnet link provided" });
  }

  console.log("Adding torrent:", magnetURI);

  client.add(magnetURI, { path: DOWNLOADS_DIR, announce: TRACKERS }, (torrent) => {
    console.log("Torrent added:", torrent.infoHash);

    let folderName = torrent.name;
    let filesInfo = torrent.files.map((file) => ({
      name: file.name,
      size: file.length,
      downloadLink: `/downloads/${encodeURIComponent(file.name)}`,
    }));

    io.emit("torrent-added", { folderName, files: filesInfo });

    torrent.on("download", () => {
      const progress = (torrent.progress * 100).toFixed(2);
      console.log(`Download progress: ${progress}%`);
      io.emit("progress", { type: "download", progress, folderName });
    });

    torrent.on("done", () => {
      console.log("All files downloaded!");
      io.emit("progress", { type: "done", folderName });
    });

    torrent.on("error", (err) => {
      console.error("Torrent error:", err.message);
      io.emit("progress", { type: "error", message: err.message });
    });

    res.json({ success: true });
  });
});

server.listen(PORT, () => {
  console.log(`Server running at ${frontendUrl}`);
});
