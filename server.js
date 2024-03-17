require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { TikTokConnectionWrapper, getGlobalConnectionCount } = require('./connectionWrapper');
const { clientBlocked } = require('./limiter');

const app = express();
const httpServer = createServer(app);
// global file path prefix that is used within a session to log different
// files with the same prefix. timestamp_streamer_<eventtype>
let filePath = "";

// Enable cross origin resource sharing
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});

/**
 * Formats the given timestamp into a string representation for a file name.
 * @param {Date} the timestamp
 * @returns {string} the string formated timestamp
 */
function formatDateTime(date)
{
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}_${hours}_${minutes}_${seconds}`;
}

io.on('connection', (socket) => {
    let tiktokConnectionWrapper;
    
    console.info('New connection from origin', socket.handshake.headers['origin'] || socket.handshake.headers['referer']);

    socket.on('setUniqueId', (uniqueId, options) => {
        
        // generate file path prefix for this session
        const time = new Date();
        filePath = "/home/ralf/Dokumente/work/" + formatDateTime(time) + "_" + uniqueId;

        // Prohibit the client from specifying these options (for security reasons)
        if (typeof options === 'object' && options) {
            delete options.requestOptions;
            delete options.websocketOptions;
        } else {
            options = {};
        }

        // Session ID in .env file is optional
        if (process.env.SESSIONID) {
            options.sessionId = process.env.SESSIONID;
            console.info('Using SessionId');
        }

        // Check if rate limit exceeded
        if (process.env.ENABLE_RATE_LIMIT && clientBlocked(io, socket)) {
            socket.emit('tiktokDisconnected', 'You have opened too many connections or made too many connection requests. Please reduce the number of connections/requests or host your own server instance. The connections are limited to avoid that the server IP gets blocked by TokTok.');
            return;
        }

        // Connect to the given username (uniqueId)
        try {
            tiktokConnectionWrapper = new TikTokConnectionWrapper(uniqueId, options, true);
            tiktokConnectionWrapper.connect();
        } catch (err) {
            socket.emit('tiktokDisconnected', err.toString());
            return;
        }

        // Redirect wrapper control events once
        tiktokConnectionWrapper.once('connected', state => socket.emit('tiktokConnected', state));
        tiktokConnectionWrapper.once('disconnected', reason => socket.emit('tiktokDisconnected', reason));

        // Notify client when stream ends
        tiktokConnectionWrapper.connection.on('streamEnd', () => socket.emit('streamEnd'));

        // Redirect message events
        tiktokConnectionWrapper.connection.on('roomUser', msg => socket.emit('roomUser', msg));
        tiktokConnectionWrapper.connection.on('member', msg => socket.emit('member', msg));
        tiktokConnectionWrapper.connection.on('chat', msg => {
            socket.emit('chat', msg);
            writeChatEventToFile(msg);
        });
        tiktokConnectionWrapper.connection.on('gift', msg => {
            socket.emit('gift', msg);
            writeGiftEventToFile(msg);
        });
        tiktokConnectionWrapper.connection.on('social', msg => socket.emit('social', msg));
        tiktokConnectionWrapper.connection.on('like', msg => {
            socket.emit('like', msg);
            writeLikeEventToFile(msg);
        });
        tiktokConnectionWrapper.connection.on('questionNew', msg => socket.emit('questionNew', msg));
        tiktokConnectionWrapper.connection.on('linkMicBattle', msg => socket.emit('linkMicBattle', msg));
        tiktokConnectionWrapper.connection.on('linkMicArmies', msg => socket.emit('linkMicArmies', msg));
        tiktokConnectionWrapper.connection.on('liveIntro', msg => socket.emit('liveIntro', msg));
        tiktokConnectionWrapper.connection.on('emote', msg => socket.emit('emote', msg));
        tiktokConnectionWrapper.connection.on('envelope', msg => socket.emit('envelope', msg));
        tiktokConnectionWrapper.connection.on('subscribe', msg => socket.emit('subscribe', msg));
    });

    socket.on('disconnect', () => {
        if (tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
        }
    });
});

//------------------------------------------------------------------------------

/** 
 * Logs a chat event to file.
 * @param chatEvent {object} tiktok chat event
 */
function writeChatEventToFile(chatEvent){
    const fs = require('fs');

    try {
        fs.appendFileSync(
            filePath + '_chat.txt',
            `${chatEvent.uniqueId};${chatEvent.nickname};${chatEvent.comment}\n`
        );
    } catch (err) {
        console.error("Failed to write to file: "+ err);
    }
}

//------------------------------------------------------------------------------

/** 
 * Logs a gift event to file.
 * @param giftEvent {object} tiktok chat event
 */
function writeGiftEventToFile(giftEvent){
    const fs = require('fs');

    try {
        if (giftEvent.gift.repeat_end == 1)
        {
            fs.appendFileSync(
                filePath + '_gift.txt',
                `${giftEvent.uniqueId};${giftEvent.nickname};${giftEvent.diamondCount * giftEvent.gift.repeat_count}\n`
            );
        }
    } catch (err) {
        console.error("Failed to write to file: "+ err);
    }
}

//------------------------------------------------------------------------------

/** 
 * Logs a gift event to file.
 * @param likeEvent {object} tiktok chat event
 */
function writeLikeEventToFile(likeEvent){
    const fs = require('fs');

    try {
        fs.appendFileSync(
            filePath + '_like.txt',
            `${likeEvent.uniqueId};${likeEvent.nickname};${likeEvent.likeCount}\n`
        );
    } catch (err) {
        console.error("Failed to write to file: "+ err);
    }
}

//------------------------------------------------------------------------------

// Emit global connection statistics
setInterval(() => {
    io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
}, 5000)

// Serve frontend files
app.use(express.static('public'));

// Start http listener
const port = process.env.PORT || 8082;
httpServer.listen(port);
console.info(`Server running! Please visit http://localhost:${port}`);