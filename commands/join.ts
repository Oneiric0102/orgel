import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { MusicPlayer } from "../music";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join a voice channel"),
  async execute(
    interaction: ChatInputCommandInteraction,
    musicPlayer: MusicPlayer
  ) {
    await musicPlayer.join(interaction);
  },
};
