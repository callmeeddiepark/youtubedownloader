const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const ytdl = youtubedl.create('yt-dlp');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Helper function to validate URL
const isValidYoutubeUrl = (url) => {
    const regex = /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
};

// GET /api/info
// Fetches metadata for a given video URL
app.get('/api/info', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl || !isValidYoutubeUrl(videoUrl)) {
        return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
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
                .filter(f => f.ext === 'mp4' && f.vcodec !== 'none') // Ensure video is present
                .map(f => {
                    // Parse height for filtering and labeling
                    const height = f.height || 0;
                    let label = `${f.width}x${f.height}`;

                    if (height >= 2160) label = '4K (2160p)';
                    else if (height >= 1440) label = '2K (1440p)';
                    else if (height >= 1080) label = 'FHD (1080p)';
                    else if (height >= 720) label = 'HD (7720p)';
                    else if (height >= 480) label = 'SD (480p)';
                    else label = `${height}p`;

                    return {
                        format_id: f.format_id,
                        ext: f.ext,
                        height: height,
                        resolution: label,
                        filesize: f.filesize || f.filesize_approx,
                        has_audio: f.acodec !== 'none'
                    };
                })
                // Filter out absurdly low resolutions and anything above 4K (2160)
                .filter(f => f.height >= 360 && f.height <= 2160)
                // Sort descending by height
                .sort((a, b) => b.height - a.height)
        };

        // Remove duplicate resolutions, keeping the best quality (usually the first one encountered due to prior sorting)
        const uniqueFormats = [];
        const seenHeights = new Set();
        for (const f of info.formats) {
            if (!seenHeights.has(f.height)) {
                uniqueFormats.push(f);
                seenHeights.add(f.height);
            }
        }
        info.formats = uniqueFormats;

        // If no formats have both video & audio (often happens with 1080p+), fallback to finding the best video+audio combined stream
        if (info.formats.length === 0) {
            info.formats = [{
                format_id: 'best',
                ext: 'mp4',
                resolution: 'Best Available',
                filesize: null
            }];
        }

        res.json(info);
    } catch (error) {
        console.error('Error fetching info:', error);
        res.status(500).json({ error: 'Failed to fetch video information' });
    }
});

// GET /api/download
// Downloads the video file using yt-dlp
app.get('/api/download', async (req, res) => {
    const videoUrl = req.query.url;
    const format = req.query.format || 'best';

    if (!videoUrl || !isValidYoutubeUrl(videoUrl)) {
        return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
    }

    try {
        // Create local downloads folder
        const downloadDir = path.join(os.homedir(), 'Downloads', '다운로더');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        // Set output path for yt-dlp directly to the target folder
        const outputPath = path.join(downloadDir, '%(title)s.%(ext)s');

        // Execute yt-dlp to download and save directly to disk
        await ytdl.exec(videoUrl, {
            format: format === 'best' ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best' : `${format}+bestaudio[ext=m4a]/best`,
            output: outputPath,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
        });

        // Respond with success and the saved path
        res.json({ success: true, path: downloadDir });

    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to complete download' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
