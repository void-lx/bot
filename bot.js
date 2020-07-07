const Discord = require('discord.js');
const Twitch = require('tmi.js');
const config = require('./config.json');
const ytdl = require('youtube-dl')
const fs = require('fs')
const tClient = new Twitch.Client({
    options: {
        debug: true
    },
    connection: {
        secure: true,
        reconnect: true
    },
    identity: {
        username: config.twitch.Username,
        password: config.twitch.Token
    },
    channels: [config.twitch.Channel]
});
const dClient = new Discord.Client();

var songName;
var songList = [];
var is_srOn = false;

/*TODO:
 *tocar a fila automaticamente
 implementar o vote skip
 implementar permissões por causa dos vacilão

 */
function voteSkip() {}

function songClear() {
    songList = [];
    fs.readdir('./musicas/', (err, files) => {
        if (err) throw err;
        for (const file of files) {
            //console.log(file);
            fs.unlink('./musicas/' + file, err => {
                if (err) throw err;
            })
        }
    })
}

async function songStop() {
    songClear();
    const connection = await dClient.channels.cache.get(config.discord.SalaDeVoz).join();
    connection.disconnect();
}

function feedback(message) {
    dClient.channels.cache.get(config.discord.SalaDeComando).send(message);
    tClient.say(config.twitch.Channel, message);
}

async function songSkip() {
    if (songList.length > 0) {
        //console.log("debug skip")
        fs.unlink('./musicas/' + songList[0] + '.webm', (err) => {
            if (err) throw err;
            songList.shift();
            if (songList.length > 0) {
                songPlay();
            }
            if (songList.length == 0){
                songStop();
            }
        })

    } else {
        //console.log("a songlist está vazia ;)")
        feedback('A song list está vazia. ;)');

    }
}
async function songPlay() {
    if (songList.length > 0) {
        //console.log("debug songplay")
        const connection = await dClient.channels.cache.get(config.discord.SalaDeVoz).join();
        setTimeout(() => {
            const dispatcher = connection.play('./musicas/' + songList[0] + '.webm', {
                filter: 'audioonly'
            });
            //console.log("debug songplay2")
            //console.log(songList.length)
            /*dispatcher.on("speaking", () => {
                console.log("speaking")
            })*/
            dispatcher.on("finish", () => {
                //console.log("debug dispatcher event")
                if (songList.length > 1) {
                    songSkip();
                }
            });
        }, 2000);

    } else {
        //console.log("songlist ta vazia.")
        feedback('A song list está vazia. ;)');
    }
}

async function songAdd(musica) {
    if (songList.length < config.bot.Fila) {
        ytdl.getInfo('ytsearch:' + musica, ['--cache-dir=./cache'], function (err, info) {
            if (err) {
                throw err
            }
            if (info._duration_raw < config.bot.SrTempo * 60) {
                if (songList.includes(info.title)) {
                    feedback('Esta música foi pedida muito recentemente. Por favor, tente outra ;)');
                } else {
                    const video = ytdl('ytsearch:' + musica,
                        ['--format=250'], {
                            cwd: __dirname
                        })
                    video.on('info', function (info) {
                        songName = info.title
                        songList.push(songName);
                        video.pipe(fs.createWriteStream('./musicas/' + songName + '.webm'))
                        feedback('A música ' + songName + ' foi adicionada');
                        //console.log("debug add 1")
                        //console.log(songList.length)
                        if (songList.length == 1) {
                            //console.log(songList.length)
                            //console.log("debug add2")
                            songPlay();
                        }
                    })
                }
            } else {
                feedback('O audio tem mais de ' + config.bot.SrTempo + ' minutos')
            }
        })
    } else {
        feedback('A fila está cheia: ' + config.bot.Fila + ' músicas');
    }
}

function songQueue() {
    var string = "------------------------\n"
    for (i = 0; i < songList.length; i++) {
        string += (songList[i] + '\n')
        if (i == 0) {
            string += "------------------------\n"
        }
    }
    return string;
}

tClient.on('message', (channel, tags, message, self) => {

    if (message.toLowerCase() === "salve") {
        tClient.say(channel, `Saaaaalve meu parça @${tags.username}!`);
    };
    if (message.startsWith(config.bot.Prefix + "sr ")) {
        if (is_srOn == true) {
            songAdd(message.substr(4));
        } else {
            feedback("Song request desativado no momento")
        }
    }
    if (message.toLowerCase() === config.bot.Prefix + "lista") {
        tClient.say(channel, songQueue())
    }
});

dClient.on('ready', () => {
    songClear();
});

dClient.on('message', async msg => {
    if (msg.content.toLowerCase() === (config.bot.Prefix + "limpar")) {
        msg.reply("falta o parâmetro número de mensagens.")
    }
    if (msg.content.toLowerCase().startsWith(config.bot.Prefix + "limpar ")) {
        async function clear(num) {
            if (num > 0 && num < 100) {
                try {
                    msg.channel.bulkDelete(num);
                } catch (error) {
                    //console.log("NaN");
                }
            }
        }
        clear(msg.content.substr(8));
    }
    if (msg.content.toLowerCase() === (config.bot.Prefix + "vem")) {
        if (msg.guild) {
            if (msg.member.voice.channel) {
                is_srOn = true;
                feedback("Song request está ativado")
                const connection = await dClient.channels.cache.get(config.discord.SalaDeVoz).join();

            } else {
                msg.reply("você precisa estar conectado a um canal de voz.")
            }
        }
    }
    if (msg.content.toLowerCase() === ("!play")) {
        songPlay();
    }

    if (msg.content.startsWith(config.bot.Prefix + "sr ")) {
        if (is_srOn == true) {
            songAdd(msg.content.substr(4))
        } else {
            feedback("Song request desativado no momento")
        }
    }

    if (msg.content.toLowerCase() === config.bot.Prefix + "vaza") {
        //checar autoridade do canal    
        is_srOn = false
        feedback("Song request desativado")
        songStop();
    }


    if (msg.content.toLowerCase() === config.bot.Prefix + "skip") {
        if (is_srOn == true) {
            songSkip();

        } else {
            feedback("Song request desativado no momento")
        }

    }
    if (msg.content.toLowerCase() === "!debug") {
        //console.log("debugging...");
        //console.log("song list length: " + songList.length)
        for (i in songList) {
            //console.log("songlist " + i + songList[i])
        }
    }

    if (msg.content.toLowerCase() === (config.bot.Prefix + "lista")) {
        msg.reply(`lista de músicas: \n` + songQueue());
    }
});

tClient.connect();
dClient.login(config.discord.DiscordToken);