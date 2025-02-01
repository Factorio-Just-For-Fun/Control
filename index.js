"use strict";

//
// LIBRARIES
//

// NPM
const { Client, GatewayIntentBits } = require('discord.js');
const { MongoClient } = require("mongodb");
const { Rcon } = require("rcon-client");
const { Tail } = require('tail');

//
// Load Settings
//

const settings = require("./settings.json");
const { json } = require('stream/consumers');
const luaCommand = 'sc';

//
// CONNECT TO NON-FACTORIO
//

// Connect Mongo
const mongoClient = new MongoClient(settings["database"]["host"]);
const database = mongoClient.db(settings["database"]["database"]);
const playerData = database.collection(settings["database"]["collection"]);

// Connect Discord
const discordClient = new Client({ intents: [ GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent ] });

//
// ESCAPE HELPER
//

// From https://github.com/clusterio/clusterio/blob/1090197acc96dac673730a0fcf710c2b50bd3c8e/packages/lib/src/lua_tools.ts#L60
function escapeString(content) {
    return content
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'")
        .replace(/\0/g, "\\0")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
}

const rcons = {}
async function createRcon(server) {
    const data = settings["servers"][server];
    let rcon = new Rcon({"host": data["host"], "port": data["port"], "password": data["password"]});

    rcon.on("connect", () => console.log(`RCon connected for server ${server}`));
    rcon.on("authenticated", () => console.log(`RCon authenticated for server ${server}`));
    rcon.on("end", () => console.error(`RCon closed for server ${server}`));
    rcon.on("error", error => console.error(`RCon errored for server ${server}\n${error}`));

    await rcon.connect();
    rcons[server] = rcon;

    return rcon;
}

// Send RCon - if not connected, reconnect
async function sendRcon(server, command) {
    console.log(`Sending command to server ${server}: ${command}`);
    try {
        let response = await rcons[server].send(command);

        console.log(`Recieved response ${response}`);
        return response;
    } catch (error) {
        console.error(`Recieved error ${error}`);
        if (error == "Error: Not connected") {
            console.error(`RCon disconnected from ${server}, retrying...`);
            let response = await (await createRcon(server)).send(command);
            console.log(`Recieved response ${response}`);
            return response;
        } else throw error;
    }
}

async function main() {
    // Connect + login to Discord
    console.log("Connecting to Discord");
    await discordClient.login(settings["discordToken"]);

    // Connect RCon, file watcher
    for (let server in settings["servers"]) {
        console.log("Connecting to server " + server)
        await createRcon(server);
    }

    console.log("Setting up Discord event handlers");

    // On Discord Message Sent
    discordClient.on("messageCreate", async message => {
        if (message.author.bot) return;
        
        // Check if this is ?online
        if (message.content == "?online") {
            let text = "";

            for (let server in settings["servers"]) {
                let players = (await sendRcon(server, "/players o")).trim().split("\n").slice(1).map(it => it.trim().split(" ")[0])
                text += `There are currently ${players.length} player(s) online on ${server} with the names: \n`;
                text += players.map(it => `- \`${it}\``).join("\n");
            }

            await message.channel.send({ content: text, allowedMentions: { parse: [] } });
            return;
        }

        // Find if this is one we care about
        for (let server in settings["servers"]) {
            const data = settings["servers"][server];
            if (data["chatChannel"] == message.channelId) {
                console.log(`Handling chat message by ${message.author.displayName} (${message.author.id}) for server ${server}: ${message.content}`);

                // Send Message
                const command = `/${luaCommand} game.print('[color=#7289DA][Discord] ${ escapeString(message.member.displayName) }: ${ escapeString(message.content) }[/color]')`;
                await sendRcon(server, command);

                await message.channel.send({ content: `:speech_balloon: | ${ message.member.displayName }: ${ message.content }`, allowedMentions: { parse: [] } });
                await message.delete();

                break;
            } else if (data["consoleChannel"] == message.channelId) {
                console.log(`Handling console message by ${message.author.displayName} (${message.author.id}) for server ${server}: ${message.content}`);
                
                // Run Command
                console.log(`Running command: ${message.content}`);
                await message.channel.send({ content: `:speech_balloon: | ${ message.member.displayName }: ${ message.content }`, allowedMentions: { parse: [] } });
                await message.delete();

                await sendRcon(server, message.content);
                break;
            }
        }
    });

    // Create File Watchers
    for (let server in settings["servers"]) {    
        // Create Datastore Watcher
        fileUpdateWatcher(settings["servers"][server]["datastore"], async line => await handleDatastoreLine(server, line)).catch(console.error);
        fileUpdateWatcher(settings["servers"][server]["log"], async line => await handleConsoleOutputLine(server, line)).catch(console.error);
    }

    console.log("Initialized");
}

// Handle a line from server
// Line is "save/request PlayerData name <raw>?"
async function handleDatastoreLine(server, line) {
    const [ operation, category, name, ...jsonParts ] = line.split(" ");

    if (category != "PlayerData") throw "Invalid Category";
    if (operation != "save" && operation != "request") throw "Invalid Operation";

    if (operation == "request") {
		let data = await playerData.findOne({ username: name });
		if (data) {
            console.log(`Found data for player ${name}: ${data}`);
			delete data.username;
			delete data._id;
		} else {       
            console.log(`No data loaded / found for ${server}, line ${line}`)
            data = {"valid": true};
        }

        let command = `/interface Datastore.ingest('request', 'PlayerData', '${ name }', '${ JSON.stringify(data) }')`;
        console.log(`Sending command to ${server}: ${command}`);

        await sendRcon(server, command);
    } else if (operation == "save") {
        let data = JSON.parse(jsonParts.join(" "));
        data["username"] = name;

        console.log(`Saving data for player ${name}, ${jsonParts.join(" ")}`);
		await playerData.replaceOne({ username: name }, data, { upsert: true });
    }
}

const prefixes = {
    "[JOIN]": "green_circle",
    "[LEAVE]": "red_circle",
    "[CHAT]": "speech_left"
}

// Watch output log
const exp = /^\[\w+\]$/;
async function handleConsoleOutputLine(server, line) {
    let parts = line.split(" ", 3);
    if (parts.length < 3) return;
    let content = line.replace(parts.join(" "), " ").trim();
    
    if (parts[2] in prefixes) {
        let message = `:${prefixes[parts[2]]}: | ${content}`;

        let channel = await discordClient.channels.fetch(settings["servers"][server]["chatChannel"]);
        await channel.send({ content: message, allowedMentions: { parse: [] } });
    } else if (exp.test(parts[2])) {
        let message = `${parts[2]} | ${content}`;

        let channel = await discordClient.channels.fetch(settings["servers"][server]["consoleChannel"]);
        await channel.send({ content: message, allowedMentions: { parse: [] } });
    }
}

// Watch a filename, and handle any new lines
async function fileUpdateWatcher(filename, handler) {
    console.log(`Starting file watching for ${filename}`);
    const tail = new Tail(filename);
    
    tail.on("error", async (error) => {
        console.error(`Tail on file ${filename} failed with error ${error}, restarting...`);
        tail.unwatch();
        await fileUpdateWatcher(filename, handler);
    });

    tail.on("line", (line) => {
        console.log(`Handling line from file ${filename}: ${line}`);
        handler(line);
    });
}

main();