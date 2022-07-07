/**
 * @module
 */
 "use strict";
 const { libPlugin, libLuaTools } = require("@clusterio/lib");
 const fs = require('node:fs/promises');
 
 class InstancePlugin extends libPlugin.BaseInstancePlugin {
    async init() {
        this.queue = [];
        this.messagePrefixes = {
            "JOIN": "green_circle",
            "LEAVE": "red_circle",
            "CHAT": "speech_left"
        }

        this.datastorePath = this.instance.path("script-output", "ext", "datastore.out");
        this.abortController = new AbortController();
        
        await fs.writeFile(this.datastorePath, "", "utf-8");
        this.fileUpdateWatcher(this.datastorePath, this.handleDatastoreLine).catch(err => console.log);
    }

    // Runs in a separate thread. When an update to the datastore file is made, read each line and call a handler
    async fileUpdateWatcher(filename, handler) {
        const watcher = fs.watch(filename, { signal: this.abortController.signal });
        try {
            for await (const event of watcher) {
                if (event.eventType != "change") continue;
                const text = await fs.readFile(filename, "utf-8");
                const lines = text.trim().split("\n");

                if (!lines.length) continue;
                for (let line of lines) await handler(line);

                await fs.writeFile(filename, "", "utf-8");
            }
        } catch (err) {
            if (err.name !== "AbortError") throw err;
        }
    }

    // Handle a line in the datastore. Only supports the "request" and "save" operations, and only for PlayerData
    async handleDatastoreLine(line) {
        const [ operation, category, name, ...jsonParts ] = line.split(" ");
        console.log(line)

        if (category != "PlayerData") throw "Invalid Category";
        if (operation != "save" && operation != "request") throw "Invalid Operation";

        if (operation == "request") {
            let { data } = await this.info.messages.playerDataFetch.send(this.instance, { username: name });
            if (!data) data = { valid: true };
            console.log(data)
            await this.sendRcon(`/sc local Datastore = require 'expcore.datastore'; Datastore.ingest('request', 'PlayerData', '${ name }', '${ JSON.stringify(data) }')`);
        } else {
            const json = jsonParts.join(" ");
            console.log(json)
            await this.info.messages.playerDataSave.send(this.instance, { username: name, data: JSON.parse(json) });
        }
    }

    
    onMasterConnectionEvent(event) {
        if (event === "connect") {
            for (let item of this.queue) {
                item.event.send(this.instance, item.message);
            }
            this.queue = [];
        }
    }

    send(event, message) {
        if (this.slave.connected) event.send(this.instance, message);
        else this.queue.push({ event, message });
    }

    // When someth happens on the server
    async onOutput(output) {
        if (output.type !== "action") return;
        
        // Send to Discord
        let content = output.message.replace(/\[\/?color(\=((\d{1,3},\d{1,3},\d{1,3})|(\w+)))?\]/g, '')
        if (output.action in this.messagePrefixes) {
            this.send(this.info.messages.ingameChat, { text: `:${ this.messagePrefixes[output.action] }: | ${ content }`, instanceId: this.instance.id });
        } else {
            this.send(this.info.messages.ingameAction, { text: `? | ${ content }`, instanceId: this.instance.id });
        }

        // Ban List Sync
        if (output.action === "BAN") {
            const ban = {
                player: content.split(" ")[0],
                reason: content.split(": ")[1].replace(/\.$/, '')
            };

            if (content.includes("Reciprocal Ban")) return; // Ignore reciprocal bans aka the reply-all of doom
            this.send(this.info.messages.ban, ban);
        }
    }

    // When someone talks on discord
    async discordChatEventHandler(message) {
        let { author, text } = message.data;
        await this.sendRcon(`/sc game.print('[color=#7289DA][Discord] ${ libLuaTools.escapeString(author) }: ${ libLuaTools.escapeString(text) }[/color]')`);
    }

    // When a command is ran on discord
    async discordCommandEventHandler(message) {
        let { command } = message.data;
        await this.sendRcon(`/${command}`);
    }

    // When a player list is requested
    async playerListRequestHandler(message) {
        const response = await this.sendRcon('/players online');
        return {
            list: response.split("\n").slice(1, -1).map(it => it.trim().replace(" (online)", "")) // Remove 1st and last element, remove (online), trim space
        }
    }
 }
 
 module.exports = {
    InstancePlugin
 };
 