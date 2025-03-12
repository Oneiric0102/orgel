import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  VoiceConnection,
  AudioPlayer,
  AudioPlayerStatus,
} from "@discordjs/voice";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import ytdl from "@distube/ytdl-core";
import ytsr from "ytsr";
import axios from "axios";

interface Song {
  url: string;
  title: string;
}

export class MusicPlayer {
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  private queue: Song[] = []; // 재생목록(큐)
  private isPlaying: boolean = false; // 현재 재생 상태
  private currentSong: Song | null = null;
  private selectedTrackIndex: number | null = null; // 현재 선택된 곡, 삭제 or 즉시재생 위해 사용
  private playerMessage: string | null = null;
  private isPaused: boolean = true;

  get getMessageId() {
    return this.playerMessage;
  }

  async checkPlayer(
    interaction: ButtonInteraction | StringSelectMenuInteraction
  ) {
    if (interaction.message.id === this.playerMessage) {
      return true;
    } else {
      interaction.reply(
        "만료된 플레이어입니다. /player 명령어를 실행해 새로운 뮤직 플레이어를 출력해주세요."
      );
      await this.deletePlayer(interaction.message.id, interaction);
      return false;
    }
  }

  async showPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
    if (this.playerMessage) {
      await this.deletePlayer(this.playerMessage, interaction);
    }
    const embed = this.getEmbed(); //뮤직플레이어 타이틀 embed
    const selectRow = this.getSelectRow(); //뮤직플레이어 재생목록 Select
    const controlRow = this.getControlRow(); //뮤직플레이어 컨트롤 버튼

    const messageId = (
      await interaction.reply({
        embeds: [embed],
        components: [selectRow, controlRow],
        withResponse: true,
      })
    ).resource?.message?.id;

    this.playerMessage = messageId ? messageId : null;
  }

  async updatePlayer(
    messageId: string | null,
    interaction:
      | ChatInputCommandInteraction
      | ButtonInteraction
      | StringSelectMenuInteraction
  ) {
    const embed = this.getEmbed(); //뮤직플레이어 타이틀 embed
    const selectRow = this.getSelectRow(); //뮤직플레이어 재생목록 Select
    const controlRow = this.getControlRow(); //뮤직플레이어 컨트롤 버튼
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      await interaction.update({
        embeds: [embed],
        components: [selectRow, controlRow],
      });
    } else if (interaction.isChatInputCommand()) {
      if (messageId) {
        const channel = interaction.channel;

        if (channel) {
          const message = await channel.messages.fetch(messageId);
          await message.edit({
            embeds: [embed],
            components: [selectRow, controlRow],
          });
        }
      }
    }
  }

  async deletePlayer(
    messageId: string | null,
    interaction:
      | ChatInputCommandInteraction
      | ButtonInteraction
      | StringSelectMenuInteraction
  ) {
    if (messageId) {
      const channel = interaction.channel;

      if (channel) {
        const message = await channel.messages.fetch(messageId);
        await message.edit({
          embeds: [],
          content: "뮤직 플레이어가 만료되었습니다.",
          components: [],
        });
        this.playerMessage = null;
      }
    }
  }

  async join(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (
      !(interaction.member instanceof GuildMember) ||
      !interaction.member.voice.channel
    ) {
      await interaction.reply("먼저 채널에 입장해주세요.");
      return false;
    }

    this.connection = joinVoiceChannel({
      channelId: interaction.member.voice.channel.id,
      guildId: interaction.guildId!,
      adapterCreator: interaction.guild!.voiceAdapterCreator,
    });
    return true;
  }

  async play(
    interaction: ChatInputCommandInteraction,
    keyword: string
  ): Promise<void> {
    // 봇이 음성 채널에 연결되어 있지 않다면 자동으로 연결
    if (!this.connection) {
      if (!(await this.join(interaction))) {
        return;
      }
    }

    const video = await this.searchYouTube(keyword);
    if (!video) {
      await interaction.reply("검색 결과가 없습니다.");
      return;
    }

    this.queue.push(video); // 큐에 추가
    await this.showPlayer(interaction);

    // 만약 현재 재생 중이 아니면 큐에서 음악 재생 시작
    if (!this.isPlaying) {
      this.playNext(interaction);
    }
  }

  private async playNext(
    interaction:
      | ChatInputCommandInteraction
      | ButtonInteraction
      | StringSelectMenuInteraction
  ): Promise<void> {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.isPaused = true;
      this.currentSong = null;

      // 1분 타이머 설정
      setTimeout(() => {
        if (!this.isPlaying && this.connection) {
          this.connection.destroy();
          this.connection = null;
          console.log("Disconnected due to inactivity.");
        }
      }, 300000); // 1분 = 60000ms

      await this.updatePlayer(this.playerMessage, interaction);
      return;
    }

    const nextTrack = this.queue.shift(); // 큐에서 다음 곡 가져오기
    if (!nextTrack) return;

    this.isPlaying = true;
    this.isPaused = false;

    console.log(nextTrack.url);
    console.log(nextTrack.title);
    try {
      const stream = ytdl(nextTrack.url, {
        highWaterMark: 1 << 25,
        quality: "highestaudio",
        liveBuffer: 4900,
        filter: "audioonly",
      });

      const resource = createAudioResource(stream);
      if (!this.player) {
        this.player = createAudioPlayer();
        this.connection?.subscribe(this.player);
        this.player.on(AudioPlayerStatus.Idle, () => {
          this.isPlaying = false;
          this.playNext(interaction); // 다음 곡 재생
        });
        this.player.on(AudioPlayerStatus.Paused, () => {
          this.isPaused = true;
        });
        this.player.on(AudioPlayerStatus.AutoPaused, () => {
          this.isPaused = true;
        });
        this.player.on(AudioPlayerStatus.Playing, () => {
          this.isPaused = false;
        });
        this.player.on("error", (error) => {
          interaction.followUp(
            "음악 재생 중 오류가 발생하여 다음곡을 재생합니다."
          );
          console.error("Error playing track:", error);
          this.isPlaying = false;
          this.isPaused = true;
          this.currentSong = null;
          this.playNext(interaction); // 다음 곡으로 넘어가기
        });
      }

      this.player.play(resource);
      this.currentSong = nextTrack;
      await this.updatePlayer(this.playerMessage, interaction);
    } catch (error) {
      console.error("Error playing track:", error);
      this.isPlaying = false;
      this.isPaused = true;
      this.currentSong = null;
      this.playNext(interaction); // 다음 곡으로 넘어가기
      throw error;
    }
  }

  async delete(interaction: ButtonInteraction) {
    if (
      this.selectedTrackIndex !== null &&
      this.selectedTrackIndex >= 0 &&
      this.queue.length > this.selectedTrackIndex
    ) {
      this.queue.splice(this.selectedTrackIndex, 1)[0];
      this.selectedTrackIndex = null;
    }
    await this.updatePlayer(this.playerMessage, interaction);
  }

  async playNow(interaction: ButtonInteraction) {
    if (
      this.selectedTrackIndex !== null &&
      this.selectedTrackIndex >= 0 &&
      this.queue.length > this.selectedTrackIndex
    ) {
      const now = this.queue.splice(this.selectedTrackIndex, 1)[0];
      this.queue.unshift(now);
      this.selectedTrackIndex = null;
      this.skip(interaction);
    }
  }

  async handleSelect(interaction: StringSelectMenuInteraction) {
    const selectedValue = interaction.values[0];
    console.log("Selected track index:", selectedValue);

    // 선택된 항목의 인덱스를 저장
    this.selectedTrackIndex = parseInt(selectedValue, 10);

    // 선택된 항목에 대한 작업을 수행
    await this.updatePlayer(this.playerMessage, interaction);
  }

  async pause(
    interaction: ChatInputCommandInteraction | ButtonInteraction
  ): Promise<void> {
    if (
      this.isPaused &&
      (interaction.isButton() || interaction.commandName === "resume")
    ) {
      this.player?.unpause();
    } else if (
      !this.isPaused &&
      (interaction.isButton() || interaction.commandName === "pause")
    ) {
      this.player?.pause();
    }

    if (interaction.isChatInputCommand()) {
      await this.showPlayer(interaction);
    }
    await this.updatePlayer(this.playerMessage, interaction);
  }

  async stop(interaction: ChatInputCommandInteraction): Promise<void> {
    this.queue = []; // 큐 초기화
    if (this.player) {
      this.player.stop();
      this.player = null;
    }
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    if (this.playerMessage) {
      await this.deletePlayer(this.playerMessage, interaction);
    }
    interaction.reply("음악 재생을 종료합니다.");
  }

  async clear(
    interaction: ChatInputCommandInteraction | ButtonInteraction
  ): Promise<void> {
    this.queue = []; // 큐 초기화
    this.skip(interaction);
  }

  async skip(
    interaction:
      | ChatInputCommandInteraction
      | ButtonInteraction
      | StringSelectMenuInteraction
  ): Promise<void> {
    this.player?.stop(); // 현재 곡 중지
    if (interaction.isChatInputCommand()) {
      await this.showPlayer(interaction);
    }
    this.isPlaying = false;
    this.isPaused = true;
    this.currentSong = null;
    this.playNext(interaction); // 다음 곡 재생
  }

  private async searchYouTube(
    keyword: string
  ): Promise<{ url: string; title: string } | null> {
    try {
      // 입력된 키워드가 YouTube URL인지 확인
      const youtubeRegex =
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/;
      if (youtubeRegex.test(keyword)) {
        // URL일 경우, 해당 URL을 그대로 사용
        const url = keyword;
        const title = await this.getTitleFromYouTubeUrl(url);
        return { url, title };
      } else {
        // 단순 문자일 경우, ytsr로 검색
        const searchResults = await ytsr(keyword, { limit: 1 });
        const topResult = searchResults.items[0];
        if (topResult && topResult.type === "video") {
          return { url: topResult.url, title: topResult.title };
        }
        return null;
      }
    } catch (error) {
      console.error("Error searching YouTube:", error);
      return null;
    }
  }
  // YouTube URL에서 제목을 가져오는 함수
  private async getTitleFromYouTubeUrl(url: string): Promise<string> {
    try {
      const response = await axios.get(
        `https://www.youtube.com/oembed?url=${url}`
      );
      return response.data.title;
    } catch (error) {
      console.error("Error getting title from YouTube URL:", error);
      return "Unknown Title";
    }
  }

  private getEmbed(): EmbedBuilder {
    return new EmbedBuilder().setTitle("Music Player").addFields({
      name: "Now Playing",
      value: this.currentSong
        ? this.currentSong.title
        : "현재 재생중인 곡이 없습니다.",
    });
  }

  private getControlRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("pause")
        .setLabel(this.isPaused ? "재생" : "일시정지")
        .setDisabled(!this.player || !this.isPlaying) // 재생 중이 아니면 비활성화
        .setStyle(this.isPaused ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("skip")
        .setLabel("다음곡")
        .setDisabled(!this.queue || this.queue.length === 0) // 큐가 비어 있으면 비활성화
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("delete")
        .setLabel("삭제")
        .setDisabled(!this.queue || this.selectedTrackIndex === null) // 큐가 비어 있거나 선택된 항목이 없으면 비활성화
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("playNow")
        .setLabel("즉시재생")
        .setDisabled(!this.queue || this.selectedTrackIndex === null) // 큐가 비어 있거나 선택된 항목이 없으면 비활성화
        .setStyle(ButtonStyle.Success)
    );
  }

  private getSelectRow(): ActionRowBuilder<StringSelectMenuBuilder> {
    let options;
    if (!this.queue || this.queue.length === 0) {
      // 큐가 비어 있을 때 Select 메뉴 비활성화
      options = [
        {
          label: "재생목록이 비어있습니다.",
          description: "새로운 곡을 추가해주세요.",
          value: "empty",
        },
      ];
    } else {
      // Select 메뉴 생성
      options = this.queue.map((track, index) => ({
        label: track.title,
        description: `Track ${index + 1}`,
        value: index.toString(), // 고유 값으로 인덱스를 사용
        default: index === this.selectedTrackIndex,
      }));
    }
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("track") // 고유 ID 설정
        .setPlaceholder(
          !this.queue || this.queue.length === 0
            ? "현재 재생목록에 곡이 없습니다."
            : "곡을 선택하여 삭제/즉시재생"
        )
        .setDisabled(!this.queue || this.queue.length === 0) // 비활성화
        .addOptions(options)
    );
  }
}
