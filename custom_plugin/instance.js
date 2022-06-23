/**
 * @module
 */
 "use strict";
 const { libPlugin, libLuaTools } = require("@clusterio/lib");
 
 class InstancePlugin extends libPlugin.BaseInstancePlugin {
    async init() {
        this.queue = [];
        this.messagePrefixes = {
            "JOIN": "green_circle",
            "LEAVE": "red_circle",
            "CHAT": "speech_left"
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
        if (output.action in this.messagePrefixes) {
            this.send(this.info.messages.ingameChat, { text: `:${ this.messagePrefixes[output.action] }: | ${output.message}`, instanceId: this.instance.id });
        } else {
            this.send(this.info.messages.ingameAction, { text: `? | ${output.message}`, instanceId: this.instance.id });
        }

        // Ban List Sync
        if (output.action === "BAN") {
            const ban = {
                player: output.message.split(" ")[0],
                reason: output.message.split(": ")[1]
            };

            if (output.message.includes("<server>")) return; // Assume a console /ban is Clusterio updating the banlist
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
 