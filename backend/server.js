const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const ytdlPath = '/opt/homebrew/bin/yt-dlp';
const ytdl = youtubedl.create(ytdlPath);
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
            preferFreeFormats: true,
            youtubeSkipDashManifest: true,
            referer: 'https://www.youtube.com/',
            extractorArgs: 'youtube:player_client=android,ios,web,tv',
            cookiesFromBrowser: 'chrome',
            addHeader: [
                'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'Accept:*/*',
                'Accept-Language:en-US,en;q=0.9',
                'Origin:https://www.youtube.com',
                'Referer:https://www.youtube.com/'
            ]
        });

        if (!output || !output.formats) {
            return res.status(404).json({ error: '비디오 형식을 찾을 수 없습니다.' });
        }

        const info = {
            title: output.title,
            thumbnail: output.thumbnail,
            duration: output.duration_string || output.duration,
            channel: output.uploader,
            formats: output.formats
                .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
                .map(f => {
                    const height = f.height || 0;
                    let label = `${f.width || '?'}x${f.height || '?'}`;
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
        console.error('Error fetching video info:', error.message);
        
        let errorMessage = '영상 정보를 가져오는데 실패했습니다.';
        if (error.message.includes('Video unavailable')) {
            errorMessage = '동영상을 사용할 수 없습니다. (비공개 또는 삭제된 영상)';
        } else if (error.message.includes('Sign in to confirm you’re not a bot')) {
            errorMessage = '유튜브 봇 감지에 걸렸습니다. 잠시 후 다시 시도해 주세요.';
        } else if (error.message.includes('HTTP Error 403')) {
            errorMessage = '요청이 거부되었습니다. (403 Forbidden)';
        }

        res.status(500).json({ error: errorMessage });
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
            extractorArgs: 'youtube:player_client=android,ios,web,tv',
            cookiesFromBrowser: 'chrome',
            addHeader: [
                'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'Accept:*/*',
                'Accept-Language:en-US,en;q=0.9'
            ]
        });

        subprocess.catch(err => {
            // Promise rejection is handled here so Node doesn't crash
            console.error('yt-dlp execution error:', err.message);
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
    res.flushHeaders();

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

app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🎬 Video Downloader Server running at http://127.0.0.1:${PORT}\n`);
});
