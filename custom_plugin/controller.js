"use strict";
const { BaseControllerPlugin } = require("@clusterio/controller");
const lib = require("@clusterio/lib");
const { Client, GatewayIntentBits } = require('discord.js');
const { MongoClient } = require("mongodb");

const { BanEvent, RunCommandEvent, IngameChatEvent, IngameActionEmbedEvent, RequestPlayerData, UpdatePlayerData } = require("./messages.js");
 
class ControllerPlugin extends BaseControllerPlugin  {
	async init() {
		this.consoleChannelIdToInstance = {};
		this.chatChannelIdToInstance = {};
		this.instanceToChatChannel = {};
		this.instanceToConsoleChannel = {};

		this.controller.config.on("fieldChanged", (group, field, prev) => {
			if (group.name === "custom_plugin") {
				this.connect();
			}
		});

		await this.connectMongo();
		await this.connectDiscord();

		this.controller.handle(BanEvent, this.banEventHandler.bind(this));
		this.controller.handle(IngameChatEvent, this.ingameChatEventHandler.bind(this));
		this.controller.handle(IngameActionEmbedEvent, this.ingameActionEmbedEventHandler.bind(this));
		this.controller.handle(RequestPlayerData, this.requestPlayerDataEventHandler.bind(this));
		this.controller.handle(UpdatePlayerData, this.updatePlayerDataEventHandler.bind(this));
	}

	// Connect and load everything mongo
	async connectMongo() {
		this.mongoClient = new MongoClient(this.controller.config.get("custom_plugin.mongo_url"));
		this.database = this.mongoClient.db('custom_plugin');
		this.playerData = this.database.collection('playerData');
	}

	// Fetch player data
	async requestPlayerDataEventHandler(event) {
		const { player } = event;
		const data = await this.playerData.findOne({ username: player });
		if (data) {
			delete data.username;
			delete data._id;
			return JSON.stringify(data);
		}
		
		return "";
	}
	
	async updatePlayerDataEventHandler(event) {
		let { player, data } = event;
		data = JSON.parse(data);
		data.username = player;
		await this.playerData.replaceOne({ username: player }, data, { upsert: true });
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
		let token = this.controller.config.get("custom_plugin.bot_token");
		if (!token) {
			this.logger.warn("Bot token not configured, bridge is offline");
			return;
		}

		this.discordClient = new Client({ intents: [ GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent ] });;
		
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
		for (let [ instanceId, instance ] of this.controller.instances.entries()) {
			let { config } = instance;

			if (channelId == config.get("custom_plugin.chat_channel")) { // If it's in a text channel, send as chat
				await this.controller.sendTo({ instanceId }, new RunCommandEvent(`/sc game.print('[color=#7289DA][Discord] ${ lib.escapeString(message.member.displayName) }: ${ lib.escapeString(message.content) }[/color]')`));

				await message.delete();
				await message.channel.send({ content: `:speech_balloon: | ${ message.member.displayName }: ${ message.content }`, disableMentions: "all" });
				return;
			} else if (channelId == config.get("custom_plugin.console_channel")) {
				await this.controller.sendTo({ instanceId }, new RunCommandEvent(message.content));
				return;
			}
		}
	}

	// Send ingame chat to discord
	async ingameChatEventHandler(event) {
		let { channel, message } = event;

		const channelObj = await this.discordClient.channels.fetch(channel);
		await channelObj.send({ content: message, disableMentions: "all" });
	}

	// Send ingame actions to discord, but fancier
	async ingameActionEmbedEventHandler(event) {
		let { channel, embed } = event;

		embed.color = parseInt(embed.color);
		const channelObj = await this.discordClient.channels.fetch(channel);
		await channelObj.send({ embeds: [ embed ], disableMentions: "all" });
	}

	async banEventHandler(event) {
		let { player, reason } = event;
        
        let user = this.controller.userManager.users.get(player);
        if (!user) user = this.controller.userManager.createUser(player);

		user.isBanned = true;
		user.banReason = reason;
		this.controller.sendTo("allInstances", new lib.InstanceBanlistUpdateEvent(player, true, `Clusterio Ban (Reason: ${ reason })` ));
	}
}

module.exports = {
	ControllerPlugin,
};
