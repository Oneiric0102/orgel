import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction } from "discord.js";
import { MusicPlayer } from "../music";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("player")
    .setDescription("뮤직 플레이어를 화면에 출력합니다."),
  async execute(
    interaction: ChatInputCommandInteraction,
    musicPlayer: MusicPlayer
  ) {
    await musicPlayer.showPlayer(interaction);
  },
};
