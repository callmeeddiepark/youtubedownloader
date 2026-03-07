import { useState } from 'react';

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [videoInfo, setVideoInfo] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState('best');
  const [downloading, setDownloading] = useState(false);

  const fetchVideoInfo = async (e) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setVideoInfo(null);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/info?url=${encodeURIComponent(url)}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch video info');
      }

      const data = await response.json();
      setVideoInfo(data);

      // Auto select best format or first available
      if (data.formats && data.formats.length > 0) {
        const best = data.formats.find(f => f.format_id === 'best');
        if (best) setSelectedFormat('best');
        else setSelectedFormat(data.formats[0].format_id);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!videoInfo || !url) return;

    setDownloading(true);
    setError(null);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const downloadUrl = `${apiUrl}/api/download?url=${encodeURIComponent(url)}&format=${selectedFormat}`;

      const response = await fetch(downloadUrl);

      if (!response.ok) {
        // Try to parse error json if possible, otherwise throw generic error
        try {
          const data = await response.json();
          throw new Error(data.error || 'Failed to download video');
        } catch {
          throw new Error(`Server returned ${response.status}: Failed to download video`);
        }
      }

      // Convert response stream to a Blob
      const blob = await response.blob();

      // Attempt to extract filename from headers if present, otherwise fallback
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'video.mp4';
      if (contentDisposition && contentDisposition.includes('filename=')) {
        const regex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = regex.exec(contentDisposition);
        if (matches != null && matches[1]) {
          filename = decodeURIComponent(matches[1].replace(/['"]/g, ''));
        }
      } else if (videoInfo && videoInfo.title) {
        const safeTitle = videoInfo.title.replace(/[/\\?%*:|"<>]/g, '-');
        filename = `${safeTitle}.mp4`;
      }

      // Create a hidden anchor tag to trigger the browser download behavior
      const urlObject = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlObject;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(urlObject);
      document.body.removeChild(a);

    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="hero">
        <h1>Video Downloader</h1>
        <p>A fast, sleek, and dynamic YouTube video grabber.</p>
      </div>

      <div className="glass-panel">
        <form onSubmit={fetchVideoInfo} className="input-group">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste YouTube Link Here..."
            className="url-input"
            disabled={loading || downloading}
            required
          />
          <button type="submit" className="btn" disabled={loading || !url}>
            {loading ? <div className="spinner"></div> : 'Fetch'}
          </button>
        </form>

        {error && <div className="error-msg">{error}</div>}

        {videoInfo && !loading && (
          <div className="video-info-container">
            <div className="video-header">
              <div className="thumbnail">
                <img src={videoInfo.thumbnail} alt={videoInfo.title} referrerPolicy="no-referrer" />
              </div>
              <div className="video-details">
                <h2>{videoInfo.title}</h2>
                <div className="video-meta">
                  <span>Channel: {videoInfo.channel}</span>
                  <span>Duration: {videoInfo.duration}</span>
                </div>
              </div>
            </div>

            <div className="options-section">
              <h3>Download Options</h3>
              <select
                title="Select Video Quality"
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                className="format-select"
                disabled={downloading}
              >
                {videoInfo.formats.map((format) => (
                  <option key={format.format_id} value={format.format_id}>
                    {format.resolution} ({(format.filesize ? (format.filesize / 1024 / 1024).toFixed(2) + ' MB' : 'Size Unknown')})
                  </option>
                ))}
              </select>

              <button
                className="btn btn-download"
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <div className="spinner"></div> Starting Download...
                  </>
                ) : (
                  'Download Video'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
