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

function scanHost(host)
{
    let tiktokConnectionWrapper;
    
    {
        // generate file path prefix for this session
        const time = new Date();
        // const basePath = "/Users/daniel/Desktop/PyCharm/scrape/sick/";
        const basePath = "/home/ralf/Dokumente/log/";
        let filePath = basePath + formatDateTime(time) + "_" + host.uniqueId;

        // Connect to the given username (uniqueId)
        try {
            options = {};
            tiktokConnectionWrapper = new TikTokConnectionWrapper(host.uniqueId, options, true);
            tiktokConnectionWrapper.connect();
        } catch (err) {
            console.error(err.toString());
            return;
        }
        
        tiktokConnectionWrapper.on("disconnected", (msg) => {
            console.info(msg + " 1");
            host.isOnline = false;
        });

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
            writeMemberEventToFile(filePath, msg);
        });
        tiktokConnectionWrapper.connection.on('chat', msg => {
            //socket.emit('chat', msg);
            writeChatEventToFile(filePath, msg);
        });
        tiktokConnectionWrapper.connection.on('gift', msg => {
            //socket.emit('gift', msg);
            writeGiftEventToFile(filePath, msg);
        });
        // Shares the Live
       /*  tiktokConnectionWrapper.connection.on('social', 
        msg => socket.emit('social', msg)); */
        // Likes the Live
        tiktokConnectionWrapper.connection.on('like', msg => {
            writeLikeEventToFile(filePath, msg);
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
function writeChatEventToFile(filePath, chatEvent){
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
function writeGiftEventToFile(filePath, giftEvent){
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
function writeLikeEventToFile(filePath, likeEvent){
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
function writeMemberEventToFile(filePath, memberEvent){
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

/// @brief 
class Host
{
    constructor(uniqueId)
    {
        this.uniqueId = uniqueId;
        this.isOnline = false;
    }
};

const sleepNow = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

//------------------------------------------------------------------------------

// Serve frontend files
app.use(express.static('public'));
// set up host to spy on
let hosts = [
    new Host('_._anthony_._._'),
    new Host('sick1.0.0'),
    new Host('ralf_005')
];

async function start()
{
    let quit = false;
    while(!quit)
    {
        hosts.forEach((host) => {
            if (!host.isOnline)
            {
                try
                {
                    scanHost(host);
                    host.isOnline = true;
                }
                catch (error) {
                    console.info("Host not online: " + host.uniqueId);
                }
            }
        });
        await sleepNow(10000);
    }
}

start();

console.info(`Server running! I can see you!`);
