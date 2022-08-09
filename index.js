#!/usr/bin/env node

// fix node-telegram-bot-api deprecated message
process.env.NTBA_FIX_319 = 1

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const escapeMD = require('markdown-escape');

const {Pool} = require('pg')

//const connectionString = process.env.POSTGRES_URL;
const telegramToken = process.env.TELEGRAM_TOKEN;
const GrupWhiteList = process.env.GROUP_WHITELIST;
const PG_HOST = process.env.POSTGRES_HOST;
const PG_USER = process.env.POSTGRES_USER;
const PG_DB = process.env.POSTGRES_DATABASE;
const PG_PASSWORD = process.env.POSTGRES_PASSWORD;
const PG_PORT = process.env.POSTGRES_PORT;
const minXP = parseInt(process.env.MIN_XP) || 500;
const moderateMode = process.env.MODERATE_ON == "true";
const lessBotSpam = process.env.LESS_BOT_SPAM == "true";
const botExpiration = (process.env.BOT_EXPIRATION || 3) * 1000;

const pool = new Pool({
    host: PG_HOST,
    user: PG_USER,
    database: PG_DB,
    password: PG_PASSWORD,
    port: PG_PORT,
    ssl: { rejectUnauthorized: false } // enable for deploy on heroku
});

var level = [
    {"level_name": "Kang Nyimak", "level_xp": 0, "level": 1},
    {"level_name": "Mulai Aktif", "level_xp": 500, "level": 2},
    {"level_name": "Chase Me", "level_xp": 1500, "level": 3},
    {"level_name": "Good Night", "level_xp": 2000, "level": 4},
    {"level_name": "Fly High", "level_xp": 2500, "level": 5},
    {"level_name": "You and I", "level_xp": 3000, "level": 6},
    {"level_name": "What", "level_xp": 3500, "level": 7},
    {"level_name": "Piri", "level_xp": 4000, "level": 8},
    {"level_name": "Deja Vu", "level_xp": 4500, "level": 9},
    {"level_name": "Scream", "level_xp": 5000, "level": 10},
    {"level_name": "Boca", "level_xp": 5500, "level": 11},
    {"level_name": "Odd Eye", "level_xp": 6000, "level": 12},
    {"level_name": "BEcause", "level_xp": 6500, "level": 13},
    {"level_name": "Maison", "level_xp": 7000, "level": 14},
    {"level_name": "DREAMCATCHER", "level_xp": 10000, "level": 15},
    {"level_name": "Onwer", "level_xp": 999999999999999999, "level": 99999} // change type column xp and next_xp on database from integer to bigint
]

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(telegramToken, {polling: true});
const GrupWhiteListArray = GrupWhiteList.split(',');

// Triggers
bot.on('text',     incrementXP);
bot.on('voice',    incrementXP);
bot.on('sticker',  incrementXP);
bot.on('photo',    incrementXP);
bot.on('video',    incrementXP);
bot.on('document', incrementXP);

// Display command
bot.onText(/\/start/, displayStart);
bot.onText(/\/help/, displayHelp);
bot.onText(/\/xp(@\w+)?/, displayXP);
bot.onText(/\/topranks(@\w+)?/, displayTopRanks);
bot.onText(/\/ranks (.+)/, displayRanks);
bot.onText(/\/ranks(@\w+)?/, displayRankHelp);
bot.onText(/\/level(@\w+)?/, displayLevel);

async function incrementXP(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = chatId + userId;

    var xp_rate = 1;

    if (msg.video) {
        xp_rate = 5
    } else if (msg.voice) {
        xp_rate = 2
    } else if (msg.photo) {
        xp_rate = 5
    } else {
        xp_rate = 1
    }


    if (!GrupWhiteListArray.includes(String(chatId)) && msg.chat.type != "private") {
        await pool.query(
            `INSERT INTO users.users (guid, gid, uid, xp, next_xp)  
             VALUES ($1, $2, $3, $4, $5)`, [key, chatId, userId, -1, -1]);
        bot.sendMessage(chatId, "Maaf botnya bukan untuk grup ini, hanya grup yang masuk whitelist. tolong keluarkan botnya!");
        return;
    }


    if (msg.chat.type == "private")
        return;

    if (msg.text && msg.text.match(/\/xp/))
        return;
    if (msg.text && msg.text.match(/\/ranks/))
        return;
    if (msg.text && msg.text.match(/\/level/))
        return;
    if (msg.text && msg.text.match(/\/help/))
        return;
    if (msg.text && msg.text.match(/\/start/))
        return;

    const entities = msg.entities || [];
    const isLink = entities.find(e => e.type == 'url');

    if (moderateMode) {
        if (isLink)
            if (!(await moderateContent(msg, match)))
                return;
    
        if (msg.photo)
            if (!(await moderateContent(msg, match)))
                return;

        if (msg.document)
            if (!(await moderateContent(msg, match)))
                return;

        if (msg.video)
            if (!(await moderateContent(msg, match)))
                return;

        if (msg.voice)
            if (!(await moderateContent(msg, match)))
                return;
    }

    
    try {
        const xpData = await pool.query('SELECT * FROM users.users WHERE guid = $1 LIMIT 1;', [key]);

        if (!xpData.rows.length) {
            try {
                await pool.query(
                    `INSERT INTO users.users (guid, gid, uid, xp, next_xp)  
                     VALUES ($1, $2, $3, $4, $5)`, [key, chatId, userId, 1, level[1].level_xp]);
                return true;
            } catch (error) {
                console.error(error.stack);
                return false;
            }
        } else {
            try {
                await pool.query(
                    `UPDATE users.users SET xp = $1
                    WHERE guid = $2`, [parseInt(xpData.rows[0].xp) + xp_rate, key]);
                
                getRandomXP(msg, match);

                if (xpData.rows[0].xp >= xpData.rows[0].next_xp) {
                    nextLevel(msg, match);
                }

                return true;
            } catch (error) {
                console.error(error.stack);
                return false;
            }
        }

    } catch (error) {
        console.error(error.stack);
        return false;
    }
    
};

async function getRandomXP(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = chatId + userId;

    const xpData = await pool.query('SELECT * FROM users.users WHERE guid = $1 LIMIT 1;', [key]);

    var XP_free = Math.floor(Math.random() * 200) + 1;

    var random1 = Math.floor(Math.random() * 521) + 1;
    var random2 = Math.floor(Math.random() * 1000) + 1;
    console.log(random1 + ' & ' + random2);
    if (random1 === random2) {
        try {
            await pool.query(
                `UPDATE users.users SET xp = $1
                WHERE guid = $2`, [xpData.rows[0].xp + XP_free, key]);

            const url = 'AgACAgUAAx0CV2IEYgACA7FiwNHuzE-FGZrppTwqNvhPSXFTHgACuKkxG2XBGVRMda0e8G8TvQEAAwIAA3gAAykE';
            bot.sendPhoto(chatId, url, {reply_to_message_id: msg.message_id, caption: 'Anjay Kamu dapat XP tambahan\n' + XP_free + ' XP 🎉'});

            return true;
        } catch (error) {
            console.error(error.stack);
            return false;
        }
    }
}

async function nextLevel(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = chatId + userId;

    const userData = await pool.query('SELECT * FROM users.users WHERE guid = $1 LIMIT 1;', [key]);
    const member = await bot.getChatMember(chatId, userId);

    let level_now = [];

    for (let i = 0; i < level.length; i++) {
        if (userData.rows[0].xp > level[i].level_xp) {
            level_now.push(level[i+1]);
        }
    }

    console.log(level_now[level_now.length-2]);

    await pool.query(`UPDATE users.users
                        SET next_xp = $1
                        WHERE guid = $2`, [level_now[level_now.length-1].level_xp, key]
    );

    let levelUp = `🌟 ${withUser(member.user)} telah mencapai level ${level_now[level_now.length-2].level} dan sekarang menjadi <b>${level_now[level_now.length-2].level_name}</b>!`;
    
    bot.sendMessage(chatId, levelUp, {parse_mode: "html"});
}

async function displayXP(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = chatId + userId;
    

    if (msg.chat.type == "private") {
        bot.sendMessage(chatId, "Ceknya di grup, Private Chat ngak ada xp xp an...", {reply_to_message_id: msg.message_id});
        return;
    }

    if (msg.reply_to_message) {
        const xp_score = await pool.query('SELECT * FROM users.users WHERE guid = $1 LIMIT 1;', [chatId + msg.reply_to_message.from.id]);
        const user_info = await bot.getChatMember(chatId, msg.reply_to_message.from.id);

        if (!xp_score.rows.length) {
            bot.sendMessage(chatId, `XP ${withUser(user_info.user)} masih 0 👶`, {parse_mode: 'html', reply_to_message_id: msg.reply_to_message.message_id});
            return;
        }

        bot.sendMessage(chatId, `XP ${withUser(user_info.user)} saat ini ` + xp_score.rows[0].xp, {parse_mode: 'html', reply_to_message_id: msg.reply_to_message.message_id});
        return;
    }

    const xp_score = [];
    const xp_score_list = await pool.query(`SELECT *, COUNT(*) OVER() AS count, RANK() OVER(ORDER BY xp DESC) AS rank
                                            FROM (SELECT DISTINCT ON (xp) *
                                                FROM users.users
                                                WHERE gid = $1
                                                ORDER BY xp DESC) s`, [chatId]
    );

    for (let i = 0; i < xp_score_list.rows.length; i++) {
        if (xp_score_list.rows[i].guid == key) {
            xp_score.push(xp_score_list.rows[i]);
            if (xp_score_list.rows[i-1] != undefined) {
                xp_score.push(xp_score_list.rows[i-1]);
            }
        }
    }


    if (!xp_score.length) {
        bot.sendMessage(chatId, "XP kamu masih 0 👶", {reply_to_message_id: msg.message_id});
        return;
    }

    if (xp_score.length > 1) {
        const member = await bot.getChatMember(chatId, xp_score[1].uid);

        bot.sendMessage(chatId, "XP kamu saat ini " + xp_score[0].xp + " dan berada di Rank #" + xp_score[0].rank + " / " + xp_score[0].count +
        "\nButuh " + (xp_score[1].xp - xp_score[0].xp) + " XP lagi untuk menyusul " + member.user.first_name, {reply_to_message_id: msg.message_id});
    } else {
        bot.sendMessage(chatId, "XP kamu saat ini " + xp_score[0].xp + " dan berada di Rank #" + xp_score[0].rank + " / " + xp_score[0].count, {reply_to_message_id: msg.message_id});
    }
}

async function displayTopRanks(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = chatId + userId;

    if (msg.chat.type == "private") {
        bot.sendMessage(chatId, "Hanya kamu Nomor Satu disini, cek di Grup dong!...", {reply_to_message_id: msg.message_id});
        return;
    }

    const xp_score = await pool.query('SELECT * FROM users.users WHERE gid = $1 ORDER BY xp DESC LIMIT 3;', [chatId]);

    console.log(xp_score.rows);

    let users = [];
    for (let i = 0; i < xp_score.rows.length; i++) {
        const member = await bot.getChatMember(chatId, xp_score.rows[i].uid);
        if (member && member.user)
            users[i] = member.user;
        else
            users[i] = {id: 0, first_name: 'Anonymous'};
    }

    if (users.length < 3) {
        for (let i = users.length; i < 3; i++) {
            users.push({id: 0, first_name: 'Anonymous'});
            xp_score.rows.push({guid: 0, gid: 0, uid: 0, xp: 0}); // biar xp ngak undefined
        }
    }

    bot.sendMessage(chatId,
        `🥇 ${withUser(users[0])} : ${xp_score.rows[0].xp} XP \n` +
        `🥈 ${withUser(users[1])} : ${xp_score.rows[1].xp} XP \n` +
        `🥉 ${withUser(users[2])} : ${xp_score.rows[2].xp} XP`,
        { parse_mode: 'html', disable_notification: true }, msg);
}

function withUser(user) {
    var fn = '';
    var ln = '';
    if (user.first_name != undefined) {
        fn = user.first_name + ' '
    } else {
        fn = ''
    }
        
    if (user.last_name != undefined) {
        ln = user.last_name
    } else {
        ln = ''
    }

    //return fn + ln;
    return `<a href='tg://user?id=${user.id}'>${fn + ln}</a>`;
}

async function displayHelp(msg, match) {
    // if (msg.chat.type != "private")
    //     return;
    bot.sendMessage(msg.chat.id, "Berikut adalah command yang bisa kamu gunakan.\n\n" +
        " - /xp - Ini akan menampilkan jumlah XP kamu (Reply sebuah pesan untuk melihat xp orang lain).\n" +
        " - /level - Akan menampilkan status level kamu.\n" +
        " - /topranks - Menampilkan 1-3 Rank.\n" +
        " - /help - Menampilkan bantuan ini.\n");
}

async function displayStart(msg, match) {
    // if (msg.chat.type != "private")
    //     return;
    bot.sendMessage(msg.chat.id, "Sampurasun, ini adalah bot XP/Leaderboard dengan Level dan lainnya.\n\n" +
        "Saat ini bot hanya untuk Grup @dreamcatcher_id dan bukan untuk umum.\n\n" +
        "Dan bot ini masih dalam tahap pengembangan, jika kamu ingin menginstall bot ini, " +
        "kamu bisa cek Source Code nya di http://github.com/sultannamja/dreamcatcher_xp/\n" +
        "bisa menggunakan Local Server atau Deploy ke heroku.\n\n" +
        "/help untuk melihat bantuan dan list command.");
}

async function displayLevel(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = chatId + userId;

    if (msg.chat.type == "private") {
        bot.sendMessage(chatId, "Ceknya di grup, Private Chat ngak nampilin level...", {reply_to_message_id: msg.message_id});
        return;
    }

    const xpData = await pool.query('SELECT * FROM users.users WHERE guid = $1 LIMIT 1;', [key]);

    if (!xpData.rows.length) {
        bot.sendMessage(chatId, "Level kamu masih 0 👶", {reply_to_message_id: msg.message_id});
        return;
    }

    let level_get = ``;

    if (msg.reply_to_message) {
        const xpData2 = await pool.query('SELECT * FROM users.users WHERE guid = $1 LIMIT 1;', [chatId + msg.reply_to_message.from.id]);
        const user_info = await bot.getChatMember(chatId, msg.reply_to_message.from.id);
        for (let i = 0; i < level.length; i++) {
            if (xpData2.rows[0].xp > level[i].level_xp) {
                level_get = `${withUser(user_info.user)} lagi di Level ${level[i].level} (${level[i].level_name}) dengan ${xpData2.rows[0].xp} XP.\n` +
                `butuh ${level[i+1].level_xp - xpData2.rows[0].xp} XP lagi untuk ke Level ${level[i+1].level}`;
            }
        }

        bot.sendMessage(chatId, level_get, {parse_mode: 'html', reply_to_message_id: msg.reply_to_message.message_id});
        return;
    }

    for (let i = 0; i < level.length; i++) {
        if (xpData.rows[0].xp > level[i].level_xp) {
            level_get = `Kamu lagi di Level ${level[i].level} (${level[i].level_name}) dengan ${xpData.rows[0].xp} XP.\n` +
            `butuh ${level[i+1].level_xp - xpData.rows[0].xp} XP lagi untuk ke Level ${level[i+1].level}`;
        }
    }
    

    bot.sendMessage(chatId, level_get, {reply_to_message_id: msg.message_id});
}

var now = new Date();
console.log(now);
var millisTill10 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 00, 0, 0) - now;
if (millisTill10 < 0) {
     millisTill10 += 86400000; // it's after 10am, try 10am tomorrow.
}
setTimeout(infoRankJadwal, millisTill10);

async function infoRankJadwal(msg, match) {
    const chatId = GrupWhiteListArray[0]

    const xp_score = await pool.query('SELECT * FROM users.users WHERE gid = $1 ORDER BY xp DESC LIMIT 3;', [chatId]);

    let users = [];
    for (let i = 0; i < xp_score.rows.length; i++) {
        const member = await bot.getChatMember(chatId, xp_score.rows[i].uid);
        if (member && member.user)
            users[i] = member.user;
        else
            users[i] = {id: 0, first_name: 'Anonymous'};
    }

    if (users.length < 3) {
        for (let i = users.length; i < 3; i++) {
            users.push({id: 0, first_name: 'Anonymous'});
            xp_score.rows.push({guid: 0, gid: 0, uid: 0, xp: 0}); // biar xp ngak undefined
        }
    }

    bot.sendMessage(chatId, `<b>Top 3 Rank saat ini</b>\n\n` +
        `🥇 ${withUser(users[0])} : ${xp_score.rows[0].xp} XP \n` +
        `🥈 ${withUser(users[1])} : ${xp_score.rows[1].xp} XP \n` +
        `🥉 ${withUser(users[2])} : ${xp_score.rows[2].xp} XP\n\n` +
        `Teruslah berinterakasi untuk meningkatkan XP dan menaikan Level, dengan tetap mematuhi Aturan tentunya.`,
        { parse_mode: 'html', disable_notification: true }, msg);
}

async function displayRanks(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = chatId + userId;

    if (msg.chat.type == "private") {
        bot.sendMessage(chatId, "Hanya kamu Nomor Satu disini, cek di Grup dong!...", {reply_to_message_id: msg.message_id});
        return;
    }

    let xp_score = [];

    if (!isNaN(parseInt(match[1]))) {
        var nilai = 0;
        if (parseInt(match[1]) > 40) {
            nilai = 40
        } else {
            nilai = parseInt(match[1])
        }
        xp_score = await pool.query('SELECT * FROM users.users WHERE gid = $1 ORDER BY xp DESC LIMIT $2;', [chatId, nilai]);
    } else {
        xp_score = await pool.query('SELECT * FROM users.users WHERE gid = $1 ORDER BY xp DESC LIMIT 5;', [chatId]);
    }
    

    let users = [];
    for (let i = 0; i < xp_score.rows.length; i++) {
        const member = await bot.getChatMember(chatId, xp_score.rows[i].uid);
        if (member && member.user) {
            users.push(`${i+1}. ${withUser(member.user)} : ${xp_score.rows[i].xp} XP`);
        } else {
            users[i] = {id: 0, first_name: 'Anonymous'};
        }
    }


    bot.sendMessage(chatId, users.join('\n'),
        { parse_mode: 'html', disable_notification: true }, msg);
}

async function displayRankHelp(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = chatId + userId;

    if (match.input !== '/ranks') {
        return;
    }

    bot.sendMessage(chatId, `ada yang kurang nichh!\nharusnya <pre>/ranks nilai</pre>\ncontoh <pre>/ranks 10</pre>\n\nmaka akan menampilkan rank dari 1 sampai 10.`,
        { parse_mode: 'html', disable_notification: true }, msg);
}

async function moderateContent(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = chatId + userId;

    if (msg.chat.type == "private")
        return;

    const data_user = await pool.query('SELECT * FROM users.users WHERE guid = $1 LIMIT 1;', [key]);
    console.log(data_user.rows);
    const score = data_user.rows[0].xp;

    if (score < minXP) {
        bot.deleteMessage(chatId, msg.message_id);

        bot.sendMessageNoSpam(chatId, `Maaf YGY, tapi kamu ${withUser(msg.from)} tidak bisa mengirimkan itu, karena XP atau Level kamu masih kurang. Banyak banyakin Interaksi di grup YGY 😚...`, { parse_mode: 'html', disable_notification: true });
        return false;
    }

    return true;
}

bot.sendMessageNoSpam = async (gid, text, options, queryMsg) => {
    const msg = await bot.sendMessage(gid, text, options);
    if (lessBotSpam)
        setTimeout(() => {
            if (queryMsg)
                bot.deleteMessage(gid, queryMsg.message_id);
            bot.deleteMessage(gid, msg.message_id);
        }, botExpiration);
}