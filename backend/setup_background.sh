#!/bin/bash
# Setup script for macOS Background Service (LaunchAgent)

cat << EOF > ~/Library/LaunchAgents/com.user.videodownloader.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.videodownloader</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/jeonghyunpark/Desktop/github/video-downloader/backend/server.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/jeonghyunpark/Desktop/github/video-downloader/backend/server_output.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/jeonghyunpark/Desktop/github/video-downloader/backend/server_error.log</string>
    <key>WorkingDirectory</key>
    <string>/Users/jeonghyunpark/Desktop/github/video-downloader/backend</string>
</dict>
</plist>
EOF

launchctl unload ~/Library/LaunchAgents/com.user.videodownloader.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.user.videodownloader.plist

echo "✅ Background service has been setup and started."
echo "You can now visit http://127.0.0.1:3001 at any time."
