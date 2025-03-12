import {
  Client,
  GatewayIntentBits,
  Collection,
  VoiceState,
  ChannelType,
} from "discord.js";
import fs from "fs";
import path from "path";
import { AudioPlayerError, getVoiceConnection } from "@discordjs/voice";
import { MusicPlayer } from "./music";

require("dotenv").config();

interface ClientWithCommands extends Client {
  commands: Collection<string, any>;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
}) as ClientWithCommands;

client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs

  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  client.commands.set(command.data.name, command);
}

let musicPlayer: MusicPlayer | null = null;

client.once("ready", () => {
  console.log("Bot is ready!");
});

client.on("interactionCreate", async (interaction) => {
  if (musicPlayer === null) {
    musicPlayer = new MusicPlayer();
  }
  try {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const validPlayer = await musicPlayer.checkPlayer(interaction);
      if (!validPlayer) {
        return;
      }
    }
    if (interaction.isButton()) {
      const customId = interaction.customId;
      if (customId === "pause") {
        await musicPlayer.pause(interaction);
      } else if (customId === "skip") {
        await musicPlayer.skip(interaction);
      } else if (customId === "delete") {
        await musicPlayer.delete(interaction);
      } else if (customId === "playNow") {
        await musicPlayer.playNow(interaction);
      }
      return;
    } else if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;
      if (customId === "track") {
        await musicPlayer.handleSelect(interaction);
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    await command.execute(interaction, musicPlayer);
  } catch (error) {
    console.log(error);
    if (
      interaction.isChatInputCommand() ||
      interaction.isButton() ||
      interaction.isStringSelectMenu()
    ) {
      if (error instanceof AudioPlayerError) {
        interaction.followUp(
          "음악 재생 중 오류가 발생하여 다음곡을 재생합니다."
        );
        musicPlayer.skip(interaction);
      } else {
        interaction.followUp("오류 발생으로 인해 플레이어를 종료합니다.");
        musicPlayer.deletePlayer(musicPlayer.getMessageId, interaction);
      }
    }
  }
});

client.on("voiceStateUpdate", (oldState: VoiceState, newState: VoiceState) => {
  if (oldState.channel && !newState.channel) {
    // 봇이 채널에서 퇴장한 경우
    if (oldState.member && oldState.member.id === client.user?.id) {
      musicPlayer = null;
    }
  }
  const channel = oldState.channel || newState.channel;
  if (channel && channel.members.size === 1) {
    const firstMember = channel.members.first();
    if (client.user && firstMember && firstMember.id === client.user.id) {
      if (channel.type === ChannelType.GuildVoice) {
        const connection = getVoiceConnection(channel.guild.id);
        if (connection) {
          connection.destroy();
        }
      }
    }
  }
});

client.login(process.env.TOKEN);
