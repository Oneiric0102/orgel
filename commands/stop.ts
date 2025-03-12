import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { MusicPlayer } from "../music";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop the music and clear the queue"),
  async execute(
    interaction: ChatInputCommandInteraction,
    musicPlayer: MusicPlayer
  ) {
    await musicPlayer.stop(interaction);
  },
};
