import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { MusicPlayer } from "../music";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip the current song and play the next one"),
  async execute(
    interaction: ChatInputCommandInteraction,
    musicPlayer: MusicPlayer
  ) {
    try {
      await musicPlayer.skip(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "An error occurred while trying to skip the song.",
        ephemeral: true,
      });
    }
  },
};
