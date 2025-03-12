import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { MusicPlayer } from "../music";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song")
    .addStringOption((option) =>
      option
        .setName("keyword")
        .setDescription("The song to play")
        .setRequired(true)
    ),
  async execute(
    interaction: ChatInputCommandInteraction,
    musicPlayer: MusicPlayer
  ) {
    const keyword = interaction.options.getString("keyword");
    if (keyword) {
      await musicPlayer.play(interaction, keyword);
    } else {
      await interaction.reply("Please provide a keyword to search for a song.");
    }
  },
};
