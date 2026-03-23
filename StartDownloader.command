#!/bin/bash
cd "$(dirname "$0")/backend"
# Start the server in the background
node server.js &
SERVER_PID=$!
sleep 2
# Open the default browser to the correct page
open "http://127.0.0.1:3001"
# Wait for the server to finish (if it somehow does, or when terminal closes)
wait $SERVER_PID
