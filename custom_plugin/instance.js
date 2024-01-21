/**
 * @module
 */
"use strict";

const { BaseInstancePlugin } = require("@clusterio/host");
const fs = require('node:fs/promises');

const { BanEvent, RunCommandEvent, IngameChatEvent, IngameActionEmbedEvent, RequestPlayerData, UpdatePlayerData } = require("./messages.js");
 
class InstancePlugin extends BaseInstancePlugin {
    async init() {
        this.messagePrefixes = {
            "JOIN": "green_circle",
            "LEAVE": "red_circle",
            "CHAT": "speech_left"
        }

        this.datastorePath = this.instance.path("script-output", "ext", "datastore.out");
        this.discordAlertPath = this.instance.path("script-output", "ext", "discord.out");
        this.abortController = new AbortController();
        
        await fs.writeFile(this.datastorePath, "", "utf-8");
        await fs.writeFile(this.discordAlertPath, "", "utf-8");

        this.fileUpdateWatcher(this.datastorePath, async line => await this.handleDatastoreLine(line)).catch(console.log);
        this.fileUpdateWatcher(this.discordAlertPath, async line => await this.handleDiscordAlertLine(line)).catch(console.log);

        this.instance.handle(RunCommandEvent, this.runCommandEventHandler.bind(this))
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

        if (category != "PlayerData") throw "Invalid Category";
        if (operation != "save" && operation != "request") throw "Invalid Operation";

        if (operation == "request") {
            let data = await this.instance.sendTo("controller", new RequestPlayerData(name));
            if (!data) data = '{"valid":true}';

            await this.sendRcon(`/sc local Datastore = require 'expcore.datastore'; Datastore.ingest('request', 'PlayerData', '${ name }', '${ data }')`);
        } else if (operation == "save") {
            const data = jsonParts.join(" ");
            await this.instance.sendTo("controller", new UpdatePlayerData(name, data));
        }
    }

    // Someth ingame sends an alert in the form of an embed
    async handleDiscordAlertLine(line) {
        const data = JSON.parse(line.replace("${serverName}", this.instance.name));
        await this.instance.sendTo("controller", new IngameActionEmbedEvent(this.instance.config.get("custom_plugin.console_channel"), data));
    }

    // When someth happens on the server
    async onOutput(output) {
        if (output.type !== "action") return;
        
        // Send to Discord
        let content = output.message.replace(/\[\/?color(\=((\d{1,3},\d{1,3},\d{1,3})|(\w+)))?\]/g, '')
        if (output.action in this.messagePrefixes) {
            this.instance.sendTo("controller", new IngameChatEvent(this.instance.config.get("custom_plugin.chat_channel"), `:${ this.messagePrefixes[output.action] }: | ${ content }`));
        }

        // Ban List Sync
        if (output.action === "BAN") {
            if (content.includes("Clusterio Ban")) return; // Ignore reciprocal bans aka the reply-all of doom

            this.instance.sendTo("controller", new BanEvent(content.split(" ")[0], content.split(": ")[1].replace(/\.$/, '')));
        }
    }

    // When a command is ran on discord
    async runCommandEventHandler(message) {
        let { command } = message;
        await this.instance.sendRcon(command);
    }
 }
 
 module.exports = {
    InstancePlugin
 };
 