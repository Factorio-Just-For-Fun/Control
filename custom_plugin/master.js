"use strict";
const libPlugin = require("@clusterio/lib/plugin");
const libLink = require("@clusterio/lib/link");
const { Client, Intents } = require('discord.js');
const { MongoClient } = require("mongodb");

class MasterPlugin extends libPlugin.BaseMasterPlugin {
	async init() {
		this.consoleChannelIdToInstance = {};
		this.chatChannelIdToInstance = {};
		this.instanceToChatChannel = {};
		this.instanceToConsoleChannel = {};

		this.master.config.on("fieldChanged", (group, field, prev) => {
			if (group.name === "custom_plugin") {
				this.connect();
			}
		});

		await this.connectMongo();
		await this.connectDiscord();
	}

	// Connect and load everything mongo
	async connectMongo() {
		this.mongoClient = new MongoClient(this.master.config.get("custom_plugin.mongo_url"));
		this.database = this.mongoClient.db('custom_plugin');
		this.platerData = this.database.collection('playerData');
	}

	// Fetch player data
	async playerDataFetchRequestHandler(message) {
		const { username } = message.data;
		const data = await this.platerData.findOne({ username: username });
		if (data) {
			delete data.username;
			delete data._id;
		}
		
		return {
			data: data
		};
	}
	
	async playerDataSaveRequestHandler(message) {
		const { username, data } = message.data;
		data.username = username;
		await this.platerData.replaceOne({ username: username }, data, { upsert: true });
	}

	// Connect and load everything discord
	async connectDiscord() {
		// Load client and channels
		if (this.discordClient) {
			this.discordClient.destroy();
			this.discordClient = null;
		}

		this.channels = {};
		
		// Get token if exists
		let token = this.master.config.get("custom_plugin.bot_token");
		if (!token) {
			this.logger.warn("Bot token not configured, bridge is offline");
			return;
		}

		this.discordClient = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });;
		
		// Hanndle messages
		this.discordClient.on("messageCreate", (message) => {
			this.onDiscordMessage(message).catch(err => { this.logger.error(`Unexpected error:\n${err.stack}`); });
		});

		// Load token
		this.logger.info("Logging in to Discord");
		try {
			await this.discordClient.login(token);
		} catch (err) {
			this.logger.error(`Error logging in to Discord, bridge is offline:\n${err.stack}`);
			this.discordClient.destroy();
			this.discordClient = null;
			return;
		}

		this.logger.info("Successfully logged in");
	}

	// When a message is recieved from discord
	async onDiscordMessage(message) {
		// No bots. Aka no self-recursion
		if (message.author.bot) return;

		// If this is in a text or console channel
		let channelId = message.channelId;
		for (let [ instanceId, instance ] of this.master.instances.entries()) {
			let { config } = instance;

			if (channelId == config.get("custom_plugin.chat_channel")) { // If it's in a text channel, send as chat
				await this.master.forwardRequestToInstance(this.info.messages.discordChat, {
					author: message.member.displayName,
					text: message.content,
					instance_id: instanceId
				});

				await message.delete();
				await message.channel.send({ content: `:speech_balloon: | ${message.member.displayName}: ${message.content}`, disableMentions: "all" });
				return;
			} else if (channelId == config.get("custom_plugin.console_channel")) { // Otherwise send it as a command
				await this.master.forwardRequestToInstance(this.info.messages.discordCommand, {
					command: message.content,
					instance_id: instanceId
				});

				return;
			}
		}
		
		// Check if this is a players online command
		if (message.content == "?online") {
			const messageParts = [];
			for (let [instanceId, instance] of this.master.instances.entries()) {				
				const { list } = await this.master.forwardRequestToInstance(this.info.messages.playerList, { instance_id: instanceId });
				let message = `There are currently ${ list.length } player(s) online on ${ instance.config.get("instance.name") }${ list.length != 0 ? " with the name(s):" : "." }\n`;
				message += list.map(it => `- \`${ it }\``).join("\n") + (list.length != 0 ? "\n" : "");
				messageParts.push(message);
			}

			await message.channel.send({ content: messageParts.join("\n"), disableMentions: "all" });
		}
	}

	// Send ingame chat to discord
	async ingameChatEventHandler(message) {
		let { instanceId, text } = message.data;

		const channel = await this.discordClient.channels.fetch(this.master.instances.get(instanceId).config.get("custom_plugin.chat_channel"));
		await channel.send({ content: text, disableMentions: "all" });
	}

	// Send ingame actions to discord
	async ingameActionEventHandler(message) {
		let { instanceId, text } = message.data;

		const channel = await this.discordClient.channels.fetch(this.master.instances.get(instanceId).config.get("custom_plugin.console_channel"));
		await channel.send({ content: text, disableMentions: "all" });
	}

	// Send ingame actions to discord, but fancier
	async ingameActionEmbedEventHandler(message) {
		let { instanceId, embed } = message.data;

		const channel = await this.discordClient.channels.fetch(this.master.instances.get(instanceId).config.get("custom_plugin.console_channel"));
		await channel.send({ embeds: [ embed ], disableMentions: "all" });
	}

	async banEventHandler(message) {
		let { player, reason } = message.data;
        
        let user = this.master.userManager.users.get(player);
        if (!user) user = this.master.userManager.createUser(player);

		user.isBanned = true;
		user.banReason = reason;
		this.broadcastEventToSlaves(libLink.messages.banlistUpdate, { name: player, banned: true, reason: "Reciprocal Ban" });
	}
}

module.exports = {
	MasterPlugin,
};