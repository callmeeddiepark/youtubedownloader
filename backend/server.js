const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const ytdl = youtubedl.create('yt-dlp');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

const app = express();
const PORT = process.env.PORT || 3001;

// Store active downloads for progress tracking
const activeDownloads = new Map();

app.use(cors());
app.use(express.json());

// Serve the HTML frontend
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to validate URL
const isValidYoutubeUrl = (url) => {
    const regex = /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
};

// Downloads folder path
const getDownloadsPath = () => {
    return path.join(os.homedir(), 'Downloads');
};

// GET /api/info — Fetches metadata for a given video URL
app.get('/api/info', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl || !isValidYoutubeUrl(videoUrl)) {
        return res.status(400).json({ error: '유효하지 않은 YouTube URL입니다.' });
    }

    try {
        const output = await ytdl(videoUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
            youtubeSkipDashManifest: true
        });

        const info = {
            title: output.title,
            thumbnail: output.thumbnail,
            duration: output.duration_string || output.duration,
            channel: output.uploader,
            formats: output.formats
                .filter(f => f.ext === 'mp4' && f.vcodec !== 'none')
                .map(f => {
                    const height = f.height || 0;
                    let label = `${f.width}x${f.height}`;
                    let qualityTag = '';

                    if (height >= 2160) { label = '4K (2160p)'; qualityTag = '4K'; }
                    else if (height >= 1440) { label = '2K (1440p)'; qualityTag = '2K'; }
                    else if (height >= 1080) { label = 'FHD (1080p)'; qualityTag = '1K'; }
                    else if (height >= 720) { label = 'HD (720p)'; qualityTag = 'HD'; }
                    else if (height >= 480) { label = 'SD (480p)'; qualityTag = 'SD'; }
                    else { label = `${height}p`; qualityTag = 'Low'; }

                    return {
                        format_id: f.format_id,
                        ext: f.ext,
                        height: height,
                        resolution: label,
                        qualityTag: qualityTag,
                        filesize: f.filesize || f.filesize_approx,
                        has_audio: f.acodec !== 'none'
                    };
                })
                .filter(f => f.height >= 480 && f.height <= 4320)
                .sort((a, b) => b.height - a.height)
        };

        // Remove duplicates, keeping best quality per resolution
        const uniqueFormats = [];
        const seenHeights = new Set();
        for (const f of info.formats) {
            if (!seenHeights.has(f.height)) {
                uniqueFormats.push(f);
                seenHeights.add(f.height);
            }
        }
        info.formats = uniqueFormats;

        if (info.formats.length === 0) {
            info.formats = [{
                format_id: 'best',
                ext: 'mp4',
                resolution: 'Best Available',
                qualityTag: 'BEST',
                filesize: null,
                has_audio: true
            }];
        }

        res.json(info);
    } catch (error) {
        console.error('Error fetching info:', error);
        res.status(500).json({ error: '영상 정보를 가져오는데 실패했습니다.' });
    }
});

// POST /api/download — Downloads video directly to Downloads folder
app.post('/api/download', async (req, res) => {
    const { url: videoUrl, format } = req.body;
    const formatId = format || 'best';

    if (!videoUrl || !isValidYoutubeUrl(videoUrl)) {
        return res.status(400).json({ error: '유효하지 않은 YouTube URL입니다.' });
    }

    const downloadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    try {
        // Get video info first
        const info = await ytdl(videoUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
        });

        const safeTitle = (info.title || 'video').replace(/[/\\?%*:|"<>]/g, '-');
        const downloadsDir = getDownloadsPath();
        const outputPath = path.join(downloadsDir, `${safeTitle}.mp4`);

        // Initialize download tracking
        activeDownloads.set(downloadId, {
            status: 'downloading',
            progress: 0,
            filename: `${safeTitle}.mp4`,
            outputPath: outputPath,
            error: null
        });

        // Return download ID immediately
        res.json({ downloadId, filename: `${safeTitle}.mp4` });

        // Start download in background
        const formatStr = formatId === 'best'
            ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
            : `${formatId}+bestaudio[ext=m4a]/best`;

        const subprocess = ytdl.exec(videoUrl, {
            format: formatStr,
            output: outputPath,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
            mergeOutputFormat: 'mp4',
        });

        // Parse progress from stderr
        subprocess.stderr.on('data', (data) => {
            const text = data.toString();
            const match = text.match(/(\d+\.?\d*)%/);
            if (match) {
                const progress = parseFloat(match[1]);
                const dl = activeDownloads.get(downloadId);
                if (dl) {
                    dl.progress = Math.min(progress, 100);
                }
            }
        });

        subprocess.on('close', (code) => {
            const dl = activeDownloads.get(downloadId);
            if (dl) {
                if (code === 0) {
                    dl.status = 'complete';
                    dl.progress = 100;
                } else {
                    dl.status = 'error';
                    dl.error = `yt-dlp exited with code ${code}`;
                }
            }
            // Clean up after 5 minutes
            setTimeout(() => activeDownloads.delete(downloadId), 5 * 60 * 1000);
        });

        subprocess.on('error', (err) => {
            const dl = activeDownloads.get(downloadId);
            if (dl) {
                dl.status = 'error';
                dl.error = err.message;
            }
        });

    } catch (error) {
        console.error('Download setup error:', error);
        activeDownloads.set(downloadId, {
            status: 'error',
            progress: 0,
            error: '다운로드를 시작할 수 없습니다.',
            filename: null,
            outputPath: null
        });
        if (!res.headersSent) {
            res.status(500).json({ error: '다운로드를 시작하는데 실패했습니다.' });
        }
    }
});

// GET /api/progress/:id — SSE endpoint for download progress
app.get('/api/progress/:id', (req, res) => {
    const downloadId = req.params.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const interval = setInterval(() => {
        const dl = activeDownloads.get(downloadId);
        if (!dl) {
            res.write(`data: ${JSON.stringify({ status: 'unknown', progress: 0 })}\n\n`);
            clearInterval(interval);
            res.end();
            return;
        }

        res.write(`data: ${JSON.stringify({
            status: dl.status,
            progress: dl.progress,
            filename: dl.filename,
            error: dl.error
        })}\n\n`);

        if (dl.status === 'complete' || dl.status === 'error') {
            clearInterval(interval);
            setTimeout(() => res.end(), 500);
        }
    }, 500);

    req.on('close', () => {
        clearInterval(interval);
    });
});

app.listen(PORT, () => {
    console.log(`\n🎬 Video Downloader Server running at http://localhost:${PORT}\n`);
});
