// Global cache that persists across imports
let globalServerCache = new Map();
let cacheCleanupInterval = null;

// Start the cache cleanup interval
const startCacheCleanup = () => {
    // Clear any existing interval first to prevent duplicates
    if (cacheCleanupInterval) {
        clearInterval(cacheCleanupInterval);
    }

    // Set up the interval to clear cache every 60 seconds
    cacheCleanupInterval = setInterval(() => {
        globalServerCache.clear();
    }, 60000); // 60 seconds

    // Ensure the interval doesn't prevent the process from exiting
    cacheCleanupInterval.unref();
};

// Start the cleanup right away
startCacheCleanup();

const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

class EaglerPing {
    constructor(options = {}) {
        this.timeout = options.timeout || 5000;
        this.debug = options.debug || false;
        this.iconCacheDir = options.iconCacheDir || path.join(process.cwd(), 'server-icons');
        this.cacheEnabled = options.cacheEnabled !== false; // Default to true
        this.cacheTTL = options.cacheTTL || 60000; // Default cache TTL: 60 seconds
    }

    log(...args) {
        if (this.debug) {
            console.log('[EaglerPing]', ...args);
        }
    }

    /**
     * Get a cached server result if available
     * @param {string} serverUrl - WebSocket URL of the server
     * @returns {Object|null} Cached server info or null if not cached
     */
    getCachedResult(serverUrl) {
        if (!this.cacheEnabled) return null;

        const cachedResult = globalServerCache.get(serverUrl);
        if (!cachedResult) return null;

        // Check if cache entry is still valid
        const now = Date.now();
        if (now - cachedResult.timestamp > this.cacheTTL) {
            this.log(`Cache expired for ${serverUrl}`);
            globalServerCache.delete(serverUrl);
            return null;
        }

        this.log(`Cache hit for ${serverUrl}`);
        return cachedResult.data;
    }

    /**
     * Cache server result
     * @param {string} serverUrl - WebSocket URL of the server
     * @param {Object} serverInfo - Server information to cache
     */
    cacheResult(serverUrl, serverInfo) {
        if (!this.cacheEnabled) return;

        globalServerCache.set(serverUrl, {
            timestamp: Date.now(),
            data: serverInfo
        });
        this.log(`Cached result for ${serverUrl}`);
    }

    /**
     * Ping an Eaglercraft server and get server information
     * @param {string} serverUrl - WebSocket URL of the server (e.g., wss://eagler.example.com)
     * @param {Object} options - Additional options
     * @param {boolean} options.fetchIcon - Whether to wait for and process the server icon
     * @param {boolean} options.bypassCache - Whether to bypass the cache and force a new request
     * @returns {Promise<Object>} Server information
     */
    ping(serverUrl, options = {}) {
        const fetchIcon = options.fetchIcon !== false; // Default to true
        const bypassCache = options.bypassCache === true; // Default to false

        // Normalize the server URL
        let finalServerUrl = serverUrl;
        if (!finalServerUrl.startsWith('ws://') && !finalServerUrl.startsWith('wss://')) {
            finalServerUrl = `wss://${finalServerUrl}`;
        }

        // Check cache first (unless bypassing)
        if (!bypassCache) {
            const cachedResult = this.getCachedResult(finalServerUrl);
            if (cachedResult) {
                return Promise.resolve(cachedResult);
            }
        }

        return new Promise((resolve, reject) => {
            this.log(`Connecting to ${finalServerUrl}`);
            this.pingStartTime = Date.now(); // Store start time for ping calculation

            const ws = new WebSocket(finalServerUrl);
            let timeoutId;
            let serverInfo = null;
            let iconData = null;

            // Set timeout for the connection
            timeoutId = setTimeout(() => {
                if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
                    ws.close();
                    reject(new Error(`Connection timed out after ${this.timeout}ms`));
                }
            }, this.timeout);

            ws.on('open', () => {
                this.log('Connection established');

                // Send the MOTD request in exact format seen in browser
                const packet = "Accept: MOTD";
                this.log('Sending request:', packet);
                ws.send(packet);
            });

            ws.on('message', async (data) => {
                this.log(`Received ${data.length} bytes`);

                // Check if it's binary data (server icon)
                if (data.length === 16384) {
                    this.log('Received server icon data (16384 bytes)');

                    if (fetchIcon) {
                        try {
                            // Pass server name if we have it already
                            const serverName = serverInfo?.name?.replace(/\s+/g, '_') || null;
                            iconData = data;

                            // If we already have the server info, we can resolve
                            if (serverInfo) {
                                serverInfo.icon = iconData;

                                // Cache the result
                                this.cacheResult(finalServerUrl, serverInfo);

                                clearTimeout(timeoutId);
                                ws.close();
                                resolve(serverInfo);
                            }
                        } catch (err) {
                            this.log('Error processing icon:', err);
                        }
                    }
                    return;
                }

                // Try to parse as JSON (server info)
                try {
                    const response = JSON.parse(data.toString());
                    this.log('Parsed server response');

                    serverInfo = this.formatServerInfo(response);

                    // If we're not waiting for icon data or we already have it, resolve
                    if (!fetchIcon || response.data.icon !== true || iconData) {
                        if (iconData) {
                            serverInfo.icon = iconData;
                        }

                        // Cache the result
                        this.cacheResult(finalServerUrl, serverInfo);

                        clearTimeout(timeoutId);
                        ws.close();
                        resolve(serverInfo);
                    }
                } catch (err) {
                    this.log('Error parsing server response:', err);
                    clearTimeout(timeoutId);
                    ws.close();
                    reject(new Error(`Failed to parse server response: ${err.message}`));
                }
            });

            ws.on('error', (error) => {
                this.log('WebSocket error:', error);
                clearTimeout(timeoutId);
                reject(error);
            });

            ws.on('close', (code, reason) => {
                this.log(`Connection closed: Code ${code}${reason ? ', Reason: ' + reason : ''}`);
                clearTimeout(timeoutId);

                // If we haven't resolved yet but have server info, resolve with what we have
                if (serverInfo) {
                    if (iconData) {
                        serverInfo.icon = iconData;
                    }

                    // Cache the result
                    this.cacheResult(finalServerUrl, serverInfo);

                    resolve(serverInfo);
                } else {
                    reject(new Error(`Connection closed before receiving data. Code: ${code}`));
                }
            });
        });
    }

    /**
     * Format the server response into a clean object
     * @param {Object} response - Raw server response
     * @returns {Object} Formatted server info
     */
    formatServerInfo(response) {
        return {
            name: response.name || 'Unknown Server',
            brand: response.brand || null,
            version: response.vers || null,
            cracked: !!response.cracked,
            uuid: response.uuid || null,
            timestamp: response.time || Date.now(),
            online: response.data?.online || 0,
            maxPlayers: response.data?.max || 0,
            motd: response.data?.motd || [],
            hasIcon: !!response.data?.icon,
            icon: response.data?.test,
            players: response.data?.players || [],
            pingTime: Date.now() - (this.pingStartTime || Date.now()),
            raw: response
        };
    }

    /**
     * Process binary icon data
     * @param {Buffer} data - Binary icon data
     * @param {string} serverUrl - Server URL for naming
     * @returns {Promise<Object>} Icon information
     */
    async processIconData(data, serverUrl, serverName = null) {
        try {
            // Use server name if provided, otherwise create a safe filename from URL
            let iconName = serverName || new URL(serverUrl).hostname.replace(/\./g, '_');
            // Remove any characters that aren't safe for filenames
            iconName = iconName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

            // Ensure directory exists
            await fs.mkdir(this.iconCacheDir, { recursive: true }).catch(err => {
                if (err.code !== 'EEXIST') throw err;
            });

            // Try to save directly as PNG if sharp is available
            try {
                const sharp = require('sharp');
                const iconFilename = `${iconName}.png`;
                const iconPath = path.join(this.iconCacheDir, iconFilename);

                // Convert RGBA to PNG
                await sharp(data, {
                    raw: {
                        width: 64,
                        height: 64,
                        channels: 4
                    }
                })
                    .png()
                    .toFile(iconPath);

                return {
                    path: iconPath,
                    width: 64,
                    height: 64,
                    format: 'png',
                    size: data.length,
                    data: data
                };
            } catch (err) {
                // Sharp not available, save as raw RGBA
                this.log('Sharp not available, saving raw RGBA data:', err.message);
                const iconFilename = `${iconName}.rgba`;
                const iconPath = path.join(this.iconCacheDir, iconFilename);
                await fs.writeFile(iconPath, data);

                return {
                    path: iconPath,
                    width: 64,
                    height: 64,
                    format: 'rgba',
                    size: data.length,
                    data: data
                };
            }
        } catch (err) {
            this.log('Error saving icon data:', err);
            return null;
        }
    }

    /**
     * Convert RGBA icon data to PNG
     * Requires the 'sharp' package: npm install sharp
     * @param {Object} iconInfo - Icon information from processIconData
     * @param {string} outputPath - Path to save the PNG file
     * @returns {Promise<string>} Path to the saved PNG
     */
    async convertIconToPng(iconInfo, outputPath) {
        try {
            // If already in PNG format and file exists, just return the path
            if (iconInfo.format === 'png' && iconInfo.path === outputPath) {
                return outputPath;
            }

            // Check if sharp is installed
            let sharp;
            try {
                sharp = require('sharp');
            } catch (err) {
                throw new Error("The 'sharp' package is required for PNG conversion. Install with: npm install sharp");
            }

            // Convert RGBA to PNG
            await sharp(iconInfo.data, {
                raw: {
                    width: iconInfo.width,
                    height: iconInfo.height,
                    channels: 4
                }
            })
                .png()
                .toFile(outputPath);

            return outputPath;
        } catch (err) {
            this.log('Error converting icon to PNG:', err);
            throw err;
        }
    }

    /**
     * Clear the server cache manually
     */
    clearCache() {
        globalServerCache.clear();
    }

    /**
     * Strip Minecraft color codes from text
     * @param {string} text - Text with color codes
     * @returns {string} Clean text
     */
    static stripColorCodes(text) {
        return text.replace(/§[0-9a-fklmnor]/g, '');
    }
}

module.exports = EaglerPing;
