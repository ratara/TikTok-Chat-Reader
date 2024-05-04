require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { TikTokConnectionWrapper, getGlobalConnectionCount } = require('./connectionWrapper');
const { clientBlocked } = require('./limiter');
const { time } = require('console');

const app = express();

let viewerCount = 0;
let likeCount = 0;

// global file path prefix that is used within a session to log different
// files with the same prefix. timestamp_streamer_<eventtype>
let filePath = "";

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

    return `${year}_${month}_${day}_${hours}_${minutes}_${seconds}`;
}

function scanHost(uniqueId)
{
    let tiktokConnectionWrapper;
    
    {
        // generate file path prefix for this session
        const time = new Date();
        const basePath = "/Users/daniel/Desktop/PyCharm/scrape/sick/";
        filePath = basePath + formatDateTime(time) + "_" + uniqueId;

        // Session ID in .env file is optional
        /* if (process.env.SESSIONID) {
            options.sessionId = process.env.SESSIONID;
            console.info('Using SessionId');
        } */

     /*    // Check if rate limit exceeded
        if (process.env.ENABLE_RATE_LIMIT && clientBlocked(io, socket)) {
            socket.emit('tiktokDisconnected', 'You have opened too many connections or made too many connection requests. Please reduce the number of connections/requests or host your own server instance. The connections are limited to avoid that the server IP gets blocked by TokTok.');
            return;
        } */

        // Connect to the given username (uniqueId)
        try {
            options = {};
            tiktokConnectionWrapper = new TikTokConnectionWrapper(uniqueId, options, true);
            tiktokConnectionWrapper.connect();
        } catch (err) {
            console.error(err.toString());
            return;
        }

        // viewer stats
        tiktokConnectionWrapper.connection.on('roomUser', (msg) => {
            if (typeof msg.viewerCount === 'number') {
                viewerCount = msg.viewerCount;
            }
        })

         tiktokConnectionWrapper.connection.on('like', (msg) => {
            if (typeof msg.totalLikeCount === 'number') {
                likeCount = msg.totalLikeCount;
            }
         })

        // Notify client when stream ends
        tiktokConnectionWrapper.connection.on('streamEnd', () => {
            console.info('streamEnd');
            tiktokConnectionWrapper.disconnect();
        });

        // Redirect message events
        //tiktokConnectionWrapper.connection.on('roomUser', msg => console());
        // Enters the room
        tiktokConnectionWrapper.connection.on('member', msg => {
            //socket.emit('member', msg);
            writeMemberEventToFile(msg);
        });
        tiktokConnectionWrapper.connection.on('chat', msg => {
            //socket.emit('chat', msg);
            writeChatEventToFile(msg);
        });
        tiktokConnectionWrapper.connection.on('gift', msg => {
            //socket.emit('gift', msg);
            writeGiftEventToFile(msg);
        });
        // Shares the Live
       /*  tiktokConnectionWrapper.connection.on('social', 
        msg => socket.emit('social', msg)); */
        // Likes the Live
        tiktokConnectionWrapper.connection.on('like', msg => {
            writeLikeEventToFile(msg);
            if (typeof msg.totalLikeCount === 'number') {
                likeCount = msg.totalLikeCount;
            }
        });
/*         tiktokConnectionWrapper.connection.on('questionNew', msg => socket.emit('questionNew', msg));
        tiktokConnectionWrapper.connection.on('linkMicBattle', msg => socket.emit('linkMicBattle', msg));
        tiktokConnectionWrapper.connection.on('linkMicArmies', msg => socket.emit('linkMicArmies', msg));
        // Live Intro / About Me
        tiktokConnectionWrapper.connection.on('liveIntro', msg => socket.emit('liveIntro', msg));
        tiktokConnectionWrapper.connection.on('emote', msg => 
        socket.emit('emote', msg));
        // Kiste
        tiktokConnectionWrapper.connection.on('envelope', msg => socket.emit('envelope', msg));
        tiktokConnectionWrapper.connection.on('subscribe', msg => socket.emit('subscribe', msg)); */
    }
};

//------------------------------------------------------------------------------

/** 
 * Logs a chat event to file.
 * @param chatEvent {object} tiktok chat event
 */
function writeChatEventToFile(chatEvent){
    const fs = require('fs');

    try {
        fs.appendFileSync(
            filePath + '_chat.csv',
            `${chatEvent.uniqueId}%${chatEvent.nickname}%${chatEvent.comment}%${chatEvent.gifterLevel}%${chatEvent.teamMemberLevel}%${chatEvent.isSubscriber}%${chatEvent.isModerator}%${chatEvent.followInfo.followingCount}%${chatEvent.followInfo.followerCount}%${chatEvent.createTime}%${viewerCount}%${likeCount}\n`
        );
    } catch (err) {
        console.error("Failed to write to file: "+ err);
    }
}

//------------------------------------------------------------------------------

/** 
 * Logs a gift event to file.
 * @param giftEvent {object} tiktok gift event
 */
function writeGiftEventToFile(giftEvent){
    const fs = require('fs');

    try {
        if ((giftEvent.giftType == 1  && giftEvent.gift.repeat_end == 1) || giftEvent.giftType != 1)
        {
            fs.appendFileSync(
                filePath + '_gift.csv',
                `${giftEvent.uniqueId}%${giftEvent.nickname}%${giftEvent.giftName}%(${giftEvent.gift.gift_id})%${giftEvent.diamondCount}%x${giftEvent.gift.repeat_count}%${giftEvent.diamondCount * giftEvent.gift.repeat_count}%${giftEvent.gifterLevel}%${giftEvent.teamMemberLevel}%${giftEvent.isSubscriber}%${giftEvent.isModerator}%${giftEvent.followInfo.followingCount}%${giftEvent.followInfo.followerCount}%${giftEvent.createTime}%${viewerCount}%${likeCount}\n`
            );
        }
    } catch (err) {
        console.error("Failed to write to file: "+ err);
    }
}

//------------------------------------------------------------------------------

/** 
 * Logs a gift event to file.
 * @param likeEvent {object} tiktok like event
 */
function writeLikeEventToFile(likeEvent){
    const fs = require('fs');

    try {
        fs.appendFileSync(
            filePath + '_like.csv',
            `${likeEvent.uniqueId}%${likeEvent.nickname}%${likeEvent.likeCount}%${likeEvent.gifterLevel}%${likeEvent.teamMemberLevel}%${likeEvent.isSubscriber}%${likeEvent.isModerator}%${likeEvent.followInfo.followingCount}%${likeEvent.followInfo.followerCount}%${likeEvent.totalLikeCount}%${likeEvent.createTime}%${viewerCount}%${likeCount}\n`
        );
    } catch (err) {
        console.error("Failed to write to file: "+ err);
    }
}


//------------------------------------------------------------------------------

/** 
 * Logs a chat event to file.
 * @param memberEvent {object} tiktok member event
 */
function writeMemberEventToFile(memberEvent){
    const fs = require('fs');

    try {
        fs.appendFileSync(
            filePath + '_member.csv',
            `${memberEvent.uniqueId}%${memberEvent.nickname}%${memberEvent.displayType}%${memberEvent.createTime}%${viewerCount}%${likeCount}\n`
        );
    } catch (err) {
        console.error("Failed to write to file: "+ err);
    }
}

/** 
 * Logs a gift event to file.
// * {object} tiktok member event
 */

//function writeMemberEventToFile(memberEvent){
//    const fs = require('fs');

//    try {
//        fs.appendFileSync(
//            filePath + '_user.csv',
//            `${userEvent.uniqueId}%${likeEvent.nickname}%${userEvent.displayType}%${userEvent.label}%${userEvent.actionId}\n`
//        );
//    } catch (err) {
//        console.error("Failed to write to file: "+ err);
//    }
// }


//------------------------------------------------------------------------------

// Serve frontend files
app.use(express.static('public'));

console.info(`Server running! I can see you!`);
scanHost('uelmen_live');
scanHost('netti_halt2007');
