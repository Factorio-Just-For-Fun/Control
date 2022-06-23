"use strict";
let { libLink, libConfig } = require("@clusterio/lib");

// Config for the master
class MasterConfigGroup extends libConfig.PluginConfigGroup { }
MasterConfigGroup.groupName = "custom_plugin";
MasterConfigGroup.defaultAccess = [ "master", "control" ];
MasterConfigGroup.define({
	name: "bot_token",
	title: "Bot Token",
	description: "Bot token to log into discord with.",
	type: "string",
	optional: true,
});
MasterConfigGroup.finalize();

// Config for the instance where channel ids are specified
class InstanceConfigGroup extends libConfig.PluginConfigGroup {}
InstanceConfigGroup.defaultAccess = [ "master", "slave", "control" ];
InstanceConfigGroup.groupName = "custom_plugin";
InstanceConfigGroup.define({
	name: "chat_channel",
	title: "Chat Channel ID",
	description: "The ID of the channel that bridges chat from Factorio to Discord.",
	type: "string",
	initial_value: "0",
});
InstanceConfigGroup.define({
	name: "console_channel",
	title: "Console Channel ID",
	description: "The ID of the channel that bridges chat from Factorio's console to Discord.",
	type: "string",
	initial_value: "0",
});
InstanceConfigGroup.finalize();


module.exports = {
    name: "custom_plugin",
    title: "FJFF Custom Plugin",
    description: "Forwards local bans to master",
    instanceEntrypoint: "instance",
    masterEntrypoint: "master",
    MasterConfigGroup,
    InstanceConfigGroup,

    messages: {
        ban: new libLink.Event({
            type: "custom_plugin:ban",
            links: [ "instance-slave", "slave-master" ],
            forwardTo: "master",
            eventProperties: {
                "player": { type: "string" },
                "reason": { type: "string" },
            },
        }),
        
        // When a discord message needs to be sent to the instance
        // Separate from command in case we want to add configs at the instance level
        discordChat: new libLink.Event({
            type: "custom_plugin:discord-chat",
            links: [ "master-slave", "slave-instance" ],
            forwardTo: "instance",
            eventProperties: {
                "author": { type: "string" },
                "text": { type: "string" },
            },
        }),
        
        // When a discord command needs to be sent to the instance
        discordCommand: new libLink.Event({
            type: "custom_plugin:discord-command",
            links: [ "master-slave", "slave-instance" ],
            forwardTo: "instance",
            eventProperties: {
                "command": { type: "string" },
            },
        }),
        
        // When ingame needs to relay a chat to the master
        ingameChat: new libLink.Event({
            type: "custom_plugin:ingame-chat",
            links: [ "instance-slave", "slave-master" ],
            forwardTo: "master",
            eventProperties: {
                "text": { type: "string" },
                "instanceId" : { type: "number" }
            },
        }),

        // When ingame needs to relay an action to the master
        ingameAction: new libLink.Event({
            type: "custom_plugin:ingame-action",
            links: [ "instance-slave", "slave-master" ],
            forwardTo: "master",
            eventProperties: {
                "text": { type: "string" },
                "instanceId" : { type: "number" }
            },
        }),

        // Requesting a player list
        playerList: new libLink.Request({
            type: "custom_plugin:request-players",
            links: [ "master-slave", "slave-instance" ],
            forwardTo: "instance",
            responseRequired: [ "list" ],
            responseProperties: {
                list: {
                    type: "array",
                    items: { type: "string" }
                }
            }
        })
    },
};
