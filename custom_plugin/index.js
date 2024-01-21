"use strict";
let messages = require("./messages.js");

const { BanEvent, RunCommandEvent, IngameChatEvent, IngameActionEmbedEvent, RequestPlayerData, UpdatePlayerData } = require("./messages.js");

module.exports = {
    plugin: {
        name: "custom_plugin",
        title: "FJFF Custom Plugin",
        description: "Forwards local bans to controller",
        instanceEntrypoint: "instance",
        messages: [ BanEvent, RunCommandEvent, IngameChatEvent, IngameActionEmbedEvent, RequestPlayerData, UpdatePlayerData ],
        controllerEntrypoint: "controller",
        controllerConfigFields: {
            "custom_plugin.bot_token": {
                title: "Bot Token",
                description: "Bot token to log into discord with.",
                type: "string",
                initial_value: "",
                access: [ "controller", "control" ]
            },
            "custom_plugin.mongo_url": {
                title: "MongoDB URL",
                description: "Where to login to mongodb",
                type: "string",
                initial_value: "mongodb://root:ThisIsNotExposedPublically@mongodb/",
                access: [ "controller", "control" ]
            }
        },
        instanceConfigFields: {
            "custom_plugin.chat_channel": {
                title: "Chat Channel ID",
                description: "The ID of the channel that bridges chat from Factorio to Discord.",
                type: "string",
                initial_value: "0",
                access: [ "controller", "host", "control" ]
            },
            
            "custom_plugin.console_channel": {
                title: "Console Channel ID",
                description: "The ID of the channel that bridges chat from Factorio's console to Discord.",
                type: "string",
                initial_value: "0",
                access: [ "controller", "host", "control" ]
            }
        },
    },
    BanEvent, RunCommandEvent, IngameChatEvent, IngameActionEmbedEvent, RequestPlayerData, UpdatePlayerData
};
