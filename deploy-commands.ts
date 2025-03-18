import { REST, Routes, SlashCommandBuilder } from "discord.js";
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("노래 재생하기")
    .addStringOption((option) =>
      option
        .setName("keyword")
        .setDescription("노래 이름 or YouTube URL")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("뮤직 플레이어 종료"),
  new SlashCommandBuilder()
    .setName("player")
    .setDescription("뮤직 플레이어 인터페이스 실행"),
  new SlashCommandBuilder().setName("clear").setDescription("재생목록 초기화"),
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN!);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID!), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();
