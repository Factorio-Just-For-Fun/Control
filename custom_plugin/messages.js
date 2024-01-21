const lib = require("@clusterio/lib");

class BanEvent {
    static type = "event";
    static src = "instance";
    static dst = [ "control", "controller" ];
    static plugin = "custom_plugin";

    constructor(player, reason) {
        this.player = player;
        this.reason = reason;
    }

    static jsonSchema = {
        type: "object",
        required: ["player", "reason"],
        properties: {
            "player": { type: "string" },
            "reason": { type: "string" }
        },
    };

    static fromJSON(json) {
        return new this(json.player, json.reason);
    }
}

class RunCommandEvent {
    static type = "event";
    static src = "controller";
    static dst = "instance";
    static plugin = "custom_plugin";

    constructor(command) {
        this.command = command;
    }

    static jsonSchema = {
        type: "object",
        required: ["command"],
        properties: {
            "command": { type: "string" }
        },
    };

    static fromJSON(json) {
        return new this(json.command);
    }
}

class IngameChatEvent {
    static type = "event";
    static src = "instance";
    static dst = [ "control", "controller" ];
    static plugin = "custom_plugin";

    constructor(channel, message) {
        this.channel = channel;
        this.message = message;
    }

    static jsonSchema = {
        type: "object",
        required: ["channel", "message"],
        properties: {
            "channel": { type: "string" },
            "message": { type: "string" }
        },
    };

    static fromJSON(json) {
        return new this(json.channel, json.message);
    }
}

class IngameActionEmbedEvent {
    static type = "event";
    static src = "instance";
    static dst = [ "control", "controller" ];
    static plugin = "custom_plugin";

    constructor(channel, embed) {
        this.channel = channel;
        this.embed = embed;
    }

    static jsonSchema = {
        type: "object",
        required: ["channel", "embed"],
        properties: {
            "channel": { type: "string" },
            "embed": { type: "object" },
        },
    };

    static fromJSON(json) {
        return new this(json.channel, json.embed);
    }
}

class RequestPlayerData {
    static type = "request";
    static src = "instance";
    static dst = [ "control", "controller" ];
    static plugin = "custom_plugin";

    constructor(player) {
        this.player = player;
    }

    static jsonSchema = {
        type: "object",
        required: ["player"],
        properties: {
            "player": { type: "string" }
        },
    };

    static fromJSON(json) {
        return new this(json.player);
    }

    static Response = lib.JsonString;
}

class UpdatePlayerData {
    static type = "event";
    static src = "instance";
    static dst = [ "control", "controller" ];
    static plugin = "custom_plugin";

    constructor(player, data) {
        this.player = player;
        this.data = data;
    }

    static jsonSchema = {
        type: "object",
        required: ["player"],
        properties: {
            "player": { type: "string" },
            "data": { type: "string" }
        },
    };

    static fromJSON(json) {
        return new this(json.player, json.data);
    }
}

module.exports = { BanEvent, RunCommandEvent, IngameChatEvent, IngameActionEmbedEvent, RequestPlayerData, UpdatePlayerData };