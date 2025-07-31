# EaglerPing.js

**Built for [TopEaglerServers.com](https://topeaglerservers.com)**

A Node.js library for pinging Eaglercraft servers and retrieving server information including MOTD, player counts, server icons, and more.

## Features

- 🚀 Fast WebSocket-based server pinging
- 📊 Retrieve server info (MOTD, player count, version, etc.)
- 🎨 Server icon fetching and processing
- ⚡ Built-in caching system with TTL
- 🔧 Configurable timeouts and options
- 🖼️ PNG conversion support (with Sharp)
- 🐛 Debug logging
- 🛡️ Error handling and timeouts

## Installation

For PNG icon conversion support, also install Sharp:
```bash
npm install sharp
```

## Quick Start

```javascript
const EaglerPing = require('eaglerping');

const ping = new EaglerPing();

// Ping a server
ping.ping('wss://eagler.example.com')
    .then(serverInfo => {
        console.log(`Server: ${serverInfo.name}`);
        console.log(`Players: ${serverInfo.online}/${serverInfo.maxPlayers}`);
        console.log(`MOTD: ${serverInfo.motd.join(' ')}`);
    })
    .catch(error => {
        console.error('Failed to ping server:', error);
    });
```

## API Documentation

### Constructor

```javascript
const ping = new EaglerPing(options);
```

#### Options
- `timeout` (number): Connection timeout in milliseconds (default: 5000)
- `debug` (boolean): Enable debug logging (default: false)
- `iconCacheDir` (string): Directory to save server icons (default: './server-icons')
- `cacheEnabled` (boolean): Enable result caching (default: true)
- `cacheTTL` (number): Cache time-to-live in milliseconds (default: 60000)

### Methods

#### `ping(serverUrl, options)`

Ping an Eaglercraft server and retrieve information.

**Parameters:**
- `serverUrl` (string): WebSocket URL of the server (e.g., 'wss://eagler.example.com' or 'eagler.example.com')
- `options` (object, optional):
  - `fetchIcon` (boolean): Whether to fetch the server icon (default: true)
  - `bypassCache` (boolean): Whether to bypass cache and force new request (default: false)

**Returns:** Promise resolving to server information object

#### `clearCache()`

Manually clear the server cache.

#### `getCachedResult(serverUrl)`

Get cached result for a server if available.

#### `static stripColorCodes(text)`

Remove Minecraft color codes from text.

## Server Response Object

```javascript
{
    name: 'Server Name',              // Server name
    brand: 'EaglercraftX 1.8',        // Server brand/software
    version: '1.8.8',                 // Minecraft version
    cracked: false,                    // Whether server is cracked
    uuid: 'server-uuid',               // Server UUID
    timestamp: 1634567890000,          // Server timestamp
    online: 15,                        // Online players
    maxPlayers: 100,                   // Maximum players
    motd: ['Welcome to', 'My Server'], // MOTD lines
    hasIcon: true,                     // Whether server has icon
    icon: Buffer,                      // Icon data (if fetched)
    players: [],                       // Player list (if available)
    pingTime: 125,                     // Ping time in milliseconds
    raw: {}                            // Raw server response
}
```

## Examples

### Basic Server Info

```javascript
const EaglerPing = require('eaglerping');
const ping = new EaglerPing({ debug: true });

async function getServerInfo() {
    try {
        const server = await ping.ping('play.eaglercraft.com');
        
        console.log(`📋 Server: ${server.name}`);
        console.log(`🎮 Version: ${server.version}`);
        console.log(`👥 Players: ${server.online}/${server.maxPlayers}`);
        console.log(`📝 MOTD: ${server.motd.join(' ')}`);
        console.log(`⏱️ Ping: ${server.pingTime}ms`);
        
        if (server.hasIcon) {
            console.log('🎨 Server has custom icon');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

getServerInfo();
```

### Fetching and Saving Server Icons

```javascript
const EaglerPing = require('eaglerping');
const fs = require('fs').promises;
const path = require('path');

const ping = new EaglerPing({
    iconCacheDir: './server-icons',
    debug: true
});

async function saveServerIcon() {
    try {
        const server = await ping.ping('eagler.example.com', {
            fetchIcon: true
        });
        
        if (server.icon) {
            // Save as PNG (requires Sharp)
            const iconPath = path.join('./icons', `${server.name}.png`);
            await ping.convertIconToPng({
                data: server.icon,
                width: 64,
                height: 64,
                format: 'rgba'
            }, iconPath);
            
            console.log(`💾 Icon saved to ${iconPath}`);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

saveServerIcon();
```

### Multiple Servers with Caching

```javascript
const EaglerPing = require('eaglerping');

const ping = new EaglerPing({
    cacheEnabled: true,
    cacheTTL: 30000, // 30 seconds
    timeout: 10000
});

const servers = [
    'server1.eagler.com',
    'server2.eagler.com',
    'server3.eagler.com'
];

async function pingMultipleServers() {
    const results = await Promise.allSettled(
        servers.map(url => ping.ping(url))
    );
    
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            const server = result.value;
            console.log(`✅ ${servers[index]}: ${server.online}/${server.maxPlayers} players`);
        } else {
            console.log(`❌ ${servers[index]}: ${result.reason.message}`);
        }
    });
}

pingMultipleServers();
```

### Clean MOTD Display

```javascript
const EaglerPing = require('eaglerping');

async function displayCleanMotd() {
    const ping = new EaglerPing();
    
    try {
        const server = await ping.ping('eagler.example.com');
        
        // Remove color codes and join MOTD lines
        const cleanMotd = server.motd
            .map(line => EaglerPing.stripColorCodes(line))
            .join('\n');
            
        console.log('Clean MOTD:');
        console.log(cleanMotd);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

displayCleanMotd();
```

## Caching

EaglerPing includes automatic caching to prevent excessive requests:

- **Global Cache**: Shared across all EaglerPing instances
- **TTL**: Configurable cache duration (default: 60 seconds)
- **Auto-cleanup**: Cache is automatically cleared every 60 seconds
- **Manual Control**: Use `clearCache()` or `bypassCache: true`

## Error Handling

Common errors and solutions:

```javascript
ping.ping('invalid-server.com')
    .catch(error => {
        if (error.message.includes('timed out')) {
            console.log('Server is not responding');
        } else if (error.message.includes('ENOTFOUND')) {
            console.log('Server not found');
        } else {
            console.log('Other error:', error.message);
        }
    });
```

## Dependencies

- `ws` - WebSocket client
- `sharp` (optional) - For PNG icon conversion

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License

## Built For

This library was specifically built for [TopEaglerServers.com](https://topeaglerservers.com) to provide reliable server pinging and monitoring capabilities for the Eaglercraft community.
