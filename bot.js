/*###############################################
TODO LIST
melhorar essa merda de código.

as configuraçẽos de prefixo, tempo de threshold a musica, 
tamanho da fila e tokens de acesso são feitas no config.json

*/
//lista de import
const Discord = require('discord.js');
const Twitch = require('tmi.js');
const config = require('./config.json');
const ytdl = require('youtube-dl')
const fs = require('fs')
//relay do irc twitch
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
//discord
const dClient = new Discord.Client();
//var globais
var songName;
var songList = [];
var votecache = [];
var is_srOn = false;

//limpa os arquivos baixados. streaming não estava funcionando bem.
function songClear() {
    //limpa a array de lista. implementar map() talvez?
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

//chama a função clear e disconecta o bot da sala
async function songStop() {
    songClear();
    const connection = await dClient.channels.cache.get(config.discord.VoiceChannel).join();
    connection.disconnect();
}

//manda feedback para os 2 clients
function feedback(message) {
    dClient.channels.cache.get(config.discord.TextChannel).send(message);
    tClient.say(config.twitch.Channel, message);
}

//skip
async function songSkip() {
    //checa se a lista não está vazia. 
    if (songList.length > 0) {
        fs.unlink('./musicas/' + songList[0] + '.webm', (err) => {
            if (err) throw err;
            songList.shift();
            if (songList.length > 0) {
                songPlay();
            }
            if (songList.length == 0) {
                songStop();
            }
        })

    } else {
        //console.log("a songlist está vazia ;)")
        feedback('A song list está vazia. ;)');

    }
}

//toca a música
async function songPlay() {
    if (songList.length > 0) {
        //reseta o cache de votos
        votecache = [];
        //console.log("debug songplay")
        //instancia a conexão
        const connection = await dClient.channels.cache.get(config.discord.VoiceChannel).join();
        //tempo necessário para que a música não pule
        setTimeout(() => {
            const dispatcher = connection.play('./musicas/' + songList[0] + '.webm', {
                filter: 'audioonly'
            });
            //eventos de listen a funçao play
            /*console.log(songList.length)
            dispatcher.on("speaking", () => {
                console.log("speaking")
            })*/
            dispatcher.on("finish", () => {
                if (songList.length >= 1) {
                    songSkip();
                }
            });
        }, 2000);

    } else {
        //console.log("songlist ta vazia.")
        feedback('A song list está vazia. ;)');
    }
}

//baixa a música do song request
async function songAdd(musica) {
    //compara com o tamanho da fila setado no config
    if (songList.length < config.bot.Fila) {
        //pega a info do arquivo no yt
        ytdl.getInfo('ytsearch:' + musica, ['--cache-dir=./cache'], function (err, info) {
            if (err) {
                throw err
            }
            //compara com o tempo setado no config
            if (info._duration_raw < config.bot.SrTempo * 60) {
                //vê se a musica já está em execução ou se está na fila
                if (songList.includes(info.title)) {
                    feedback('Esta música foi pedida muito recentemente. Por favor, tente outra ;)');
                } else {
                    //configuração do ytdl
                    const video = ytdl('ytsearch:' + musica,
                        ['--format=251'], {
                            cwd: __dirname
                        })
                    //evento de download do arquivo no yt
                    video.on('info', function (info) {
                        songName = info.title
                        fs.writeFile(songName)
                        songList.push(songName);
                        //pipe de download do writestream
                        video.pipe(fs.createWriteStream('./musicas/' + songName + '.webm'))
                        feedback('A música ' + songName + ' foi adicionada');
                        if (songList.length == 1) {
                            //chama o songplay pra iniciar o loop de musicas
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

//organiza a lista para display
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

//evento on message do chat da twitch
tClient.on('message', (channel, tags, message, self) => {

    if (message.toLowerCase() === (config.bot.Prefix + 'skip')) {
        if (is_srOn) {
            //checa se o maladrinho já voltou
            if (votecache.includes(tags.username)) {
                tClient.say(channel, `@${tags.username} Você já votou, malandrinho!!`)
            } else {
                //add o nome do malandrinho no cache
                votecache.push(tags.username)
                //checa se malandrinhos suficientes já votaram
                if (votecache.length == config.bot.Votes) {
                    songSkip();
                }
            }
            if (tags.username == config.twitch.Channel && is_srOn) {
                songSkip();
            }
        }
    }

    //pede a música 
    if (message.startsWith(config.bot.Prefix + "sr ")) {
        if (is_srOn) {
            songAdd(message.substr(4));
        } else {
            //feedback("Song request desativado no momento")
        }
    }

    //display da lista de musicas
    if (message.toLowerCase() === config.bot.Prefix + "lista") {
        tClient.say(channel, songQueue())
    }
});

//evento onready do discord
dClient.on('ready', () => {
    //limpa as musicas que eventualmente fiquem no cache caso o app de um crash
    songClear();
});

//evento on message
dClient.on('message', async msg => {
    if (msg.content.toLowerCase() === (config.bot.Prefix + "limpar")) {
        msg.reply("falta o parâmetro número de mensagens.")
    }

    //comando limpar. aceita valores entre 1 e 99
    if (msg.content.toLowerCase().startsWith(config.bot.Prefix + "limpar ") && msg.member.hasPermission('BAN_MEMBERS','KICK_MEMBERS')) {
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
    } else {
        msg.reply("Sem permissões para a ação");
    }

    //chama o bot para a sala e libera o song request
    if (msg.content.toLowerCase() === (config.bot.Prefix + "vem")) {
        if (msg.guild && msg.member.hasPermission('BAN_MEMBERS', 'KICK_MEMBERS')) {
            if (msg.member.voice.channel) {
                is_srOn = true;
                feedback("Song request está ativado")
                const connection = await dClient.channels.cache.get(config.discord.VoiceChannel).join();
            } else {
                msg.reply("você precisa estar conectado a um canal de voz.")
            }
        }
    }

    //song request .
    if (msg.content.startsWith(config.bot.Prefix + "sr ")) {
        if (is_srOn) {
            songAdd(msg.content.substr(4))
        } else {
            //feedback("Song request desativado no momento")
        }
    }

    //tira o bot do canal de voz e bloqueia o sr
    if (msg.content.toLowerCase() === config.bot.Prefix + "vaza") {
        if (msg.member.hasPermission('BAN_MEMBERS', 'KICK_MEMBERS')) {
            is_srOn = false
            feedback("Song request desativado")
            songStop();
        }
    }

    //skip song
    if (msg.content.toLowerCase() === config.bot.Prefix + "skip") {
        if (msg.member.hasPermission('BAN_MEMBERS', 'KICK_MEMBERS')) {
            if (is_srOn) {
                songSkip();
            } else {
                feedback("Song request desativado no momento")
            }
        } else {}
    }

    //display da lista de musicas
    if (msg.content.toLowerCase() === (config.bot.Prefix + "lista")) {
        msg.reply(`lista de músicas: \n` + songQueue());
    }
});
//inicia os clients
tClient.connect();
dClient.login(config.discord.DiscordToken);