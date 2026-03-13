# WebSocket Authentication Migration Guide

## Overview
WebSocket connections now require authentication to prevent unauthorized access. All existing WebSocket connections must be updated to use the new authenticated connection helper.

## Security Improvements
1. **Authentication Required**: All WebSocket connections must authenticate with a token on first connection
2. **Localhost Only**: WebSocket server now binds to `127.0.0.1` instead of `0.0.0.0`
3. **User-Specific Broadcasts**: Messages are only sent to authenticated users
4. **Token-Based Auth**: HMAC-SHA256 tokens prevent tampering

## How to Update Existing Code

### Old Code (INSECURE)
```javascript
const socket = new WebSocket("wss://" + window.location.host + "/ws");

socket.addEventListener('message', function(event) {
    const data = JSON.parse(event.data);
    // Handle message
});
```

### New Code (SECURE)
```javascript
// Protocol is auto-detected (wss:// for HTTPS, ws:// for HTTP)
const socket = window.createAuthenticatedWebSocket(
    null, // Use default /ws endpoint (auto-detects protocol)
    function(data) {
        // Handle message (called only after successful authentication)
        console.log('Received:', data);
    },
    function(error) {
        // Optional: Handle errors
        console.error('WebSocket error:', error);
    }
);
```

**Note**: The URL parameter can be `null` to auto-detect the protocol based on the page (HTTPS → wss://, HTTP → ws://). This is the recommended approach.

## Files That Need Updating

The following files contain WebSocket connections that need to be migrated:

1. **public/js/tech.js** (line 1325)
2. **public/js/musician.js** (line 57)
3. **templates/text_layout.html** (line 416)
4. **templates/text_layout_streaming.html** (line 165)

## Migration Steps

For each file:

1. Replace `new WebSocket(...)` with `window.createAuthenticatedWebSocket(...)`
2. Move the message handling code to the callback function
3. Optionally add error handling callback
4. Remove manual `socket.addEventListener('message', ...)` if using callback

## Example Migration

### Before:
```javascript
const socket = new WebSocket("wss://" + window.location.host + "/ws");

socket.addEventListener('message', function(event) {
    const data = JSON.parse(event.data);
    if (data.type === 'update_needed') {
        updateSongDisplay();
    }
});

socket.addEventListener('error', function(error) {
    console.error('WebSocket error:', error);
});
```

### After:
```javascript
const socket = window.createAuthenticatedWebSocket(
    "wss://" + window.location.host + "/ws",
    function(data) {
        if (data.type === 'update_needed') {
            updateSongDisplay();
        }
    },
    function(error) {
        console.error('WebSocket error:', error);
    }
);
```

## Testing

After updating, verify:

1. WebSocket connection establishes successfully
2. First message sent is authentication (check browser DevTools > Network > WS)
3. Server responds with `{"type":"auth_success",...}`
4. Subsequent messages are received and processed
5. Unauthorized connections are rejected

## Troubleshooting

### Connection Rejected
- Check that `window.WS_USER_ID` and `window.WS_AUTH_TOKEN` are defined
- Verify user is logged in (tokens are only generated for authenticated sessions)
- Check browser console for authentication errors

### Messages Not Received
- Ensure WebSocket server is running (`php websocket-server.php`)
- Verify WebSocket URL is correct (should match server binding)
- Check that authentication succeeded before expecting messages

### Server Not Starting
- Make sure port 2345 is not in use: `netstat -ano | findstr 2345`
- Check that Workerman dependencies are installed: `composer install`
- Review server logs for errors

## Security Notes

- **DO NOT** share WebSocket tokens between users
- **DO NOT** log tokens in production code
- Tokens are tied to the user's session and encryption key
- Tokens are regenerated on each page load (not persistent)
- Failed authentication attempts close the connection immediately

## Nginx/Proxy Configuration (REQUIRED for HTTPS)

**IMPORTANT**: A reverse proxy is **REQUIRED** for production use, especially when serving the site over HTTPS.

### Why Reverse Proxy is Needed

1. **HTTPS Compatibility**: Browsers block insecure WebSocket (`ws://`) connections from HTTPS pages
2. **Port Flexibility**: WebSocket server runs on port 2345, but clients connect via standard HTTPS port 443
3. **Security**: WebSocket server only binds to localhost (127.0.0.1), so external access must go through proxy

### Quick Setup

See the complete configuration in `nginx-websocket-config.conf`

**Minimal Nginx configuration:**

```nginx
# Add to http {} block (OUTSIDE server block)
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

# Add to your server {} block
location /ws {
    proxy_pass http://127.0.0.1:2345;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_buffering off;
}
```

**Apply configuration:**
```bash
sudo nginx -t                    # Test configuration
sudo systemctl reload nginx      # Apply changes
```

### Verification

1. **Start WebSocket server**: `php websocket-server.php`
2. **Open browser DevTools** → Network → WS tab
3. **Should see**: Connection to `wss://your-domain.com/ws`
4. **Status**: 101 Switching Protocols
5. **First message**: `{type: 'auth', userId: X, token: '...'}`
6. **Response**: `{type: 'auth_success', message: 'Authenticated'}`

If you see errors, check:
- Nginx error log: `sudo tail -f /var/log/nginx/error.log`
- WebSocket is running: `netstat -tlnp | grep 2345`
- Configuration syntax: `sudo nginx -t`

## Rollback

If issues occur, you can temporarily revert by:

1. Changing WebSocket binding back to `0.0.0.0` in `websocket-server.php:11`
2. Removing authentication check in `websocket-server.php:24-67`
3. Reverting JavaScript files to use `new WebSocket()` directly

**WARNING**: This removes security protections and should only be done temporarily for debugging.
