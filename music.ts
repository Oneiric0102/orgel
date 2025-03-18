import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextBasedChannel,
} from "discord.js";
import { DisTube, DisTubeEvents, DisTubeVoice } from "distube";
import SoundCloudPlugin from "@distube/soundcloud";
import SpotifyPlugin from "@distube/spotify";
import { YouTubePlugin } from "@distube/youtube";

export class MusicPlayer {
  private selectedTrackIndex: number | null = null; // 현재 선택된 곡, 삭제 or 즉시재생 위해 사용
  private messageId: string | null = null;
  private distube: DisTube;
  private textChannel: TextBasedChannel | null = null;
  private isAutoPlay: boolean = false;
  private distubeVoice: DisTubeVoice | null = null;

  constructor(client: Client) {
    this.distube = new DisTube(client, {
      plugins: [new SpotifyPlugin(), new SoundCloudPlugin()],
    });
    this.distube.on("playSong" as keyof DisTubeEvents, () => {
      this.updatePlayer();
    });
    this.distube.on("finish" as keyof DisTubeEvents, () => {
      console.log("finish");
      this.clear();
    });
    this.distube.on("addSong" as keyof DisTubeEvents, () => {
      this.updatePlayer();
    });
    this.distube.on("disconnet" as keyof DisTubeEvents, () => {
      console.log("disconnet");
      this.deletePlayer();
    });
    this.distube.on("error" as keyof DisTubeEvents, (error: Error) => {
      console.log(error);
      this.skip();
    });
  }

  get getMessageId() {
    return this.messageId;
  }

  async checkPlayer(
    interaction: ButtonInteraction | StringSelectMenuInteraction
  ) {
    if (interaction.message.id === this.messageId) {
      return true;
    } else {
      interaction.reply(
        "만료된 플레이어입니다. /player 명령어를 실행해 새로운 뮤직 플레이어를 출력해주세요."
      );
      await this.deletePlayer(interaction);
      return false;
    }
  }

  async showPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.distubeVoice) {
      this.join(interaction);
    }
    if (this.messageId) {
      await this.deletePlayer();
    }
    const embed = this.getEmbed(); //뮤직플레이어 타이틀 embed
    const selectRow = this.getSelectRow(); //뮤직플레이어 재생목록 Select
    const controlRow = this.getControlRow(); //뮤직플레이어 컨트롤 버튼

    const message = (
      await interaction.reply({
        embeds: [embed],
        components: [selectRow, controlRow],
        withResponse: true,
      })
    ).resource?.message;
    const messageId = message?.id;
    const channelId = message?.channel;

    this.messageId = messageId ? messageId : null;
    this.textChannel = channelId ? channelId : null;
  }

  async updatePlayer(
    interaction?:
      | ChatInputCommandInteraction
      | ButtonInteraction
      | StringSelectMenuInteraction
  ) {
    const embed = this.getEmbed(); //뮤직플레이어 타이틀 embed
    const selectRow = this.getSelectRow(); //뮤직플레이어 재생목록 Select
    const controlRow = this.getControlRow(); //뮤직플레이어 컨트롤 버튼
    if (interaction) {
      if (interaction.isChatInputCommand()) {
        await this.showPlayer(interaction);
      } else {
        await interaction.update({
          embeds: [embed],
          components: [selectRow, controlRow],
        });
        return;
      }
    }
    if (this.messageId && this.textChannel) {
      const message = await this.textChannel.messages.fetch(this.messageId);
      await message.edit({
        embeds: [embed],
        components: [selectRow, controlRow],
      });
    }
  }

  async deletePlayer(
    interaction?: ButtonInteraction | StringSelectMenuInteraction
  ) {
    if (interaction) {
      await interaction.message.edit({
        embeds: [],
        content: "뮤직 플레이어가 만료되었습니다.",
        components: [],
      });
    } else if (this.messageId && this.textChannel) {
      const message = await this.textChannel.messages.fetch(this.messageId);
      await message.edit({
        embeds: [],
        content: "뮤직 플레이어가 만료되었습니다.",
        components: [],
      });
      this.messageId = null;
    }
  }

  private async join(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (
      !(interaction.member instanceof GuildMember) ||
      !interaction.member.voice.channel
    ) {
      await interaction.reply("먼저 채널에 입장해주세요.");
      return false;
    }

    const distubeVoice = interaction.member.voice.channel;
    this.distubeVoice = await this.distube.voices.join(distubeVoice);
    return true;
  }

  async play(
    interaction: ChatInputCommandInteraction,
    keyword: string
  ): Promise<void> {
    // 봇이 음성 채널에 연결되어 있지 않다면 자동으로 연결
    if (!this.distubeVoice) {
      if (!(await this.join(interaction))) {
        return;
      }
    }

    try {
      await this.showPlayer(interaction);
      this.distube.play(this.distubeVoice!.channel, keyword);
    } catch (error) {
      interaction.reply("재생할 수 없는 곡입니다.");
    }
  }

  async delete(interaction: ButtonInteraction) {
    if (this.distubeVoice && this.selectedTrackIndex) {
      this.distube
        .getQueue(this.distubeVoice)
        ?.songs.splice(this.selectedTrackIndex, 1)[0];
      this.selectedTrackIndex = null;
    }
    await this.updatePlayer(interaction);
  }

  async playNow(interaction: ButtonInteraction) {
    if (this.distubeVoice && this.selectedTrackIndex) {
      const queue = this.distube.getQueue(this.distubeVoice);
      if (queue) {
        const now = queue.songs.splice(this.selectedTrackIndex, 1)[0];
        if (now) {
          queue.songs.splice(1, 0, now);
          this.skip(interaction);
        }
      }
    }
    this.selectedTrackIndex = null;
  }

  async handleSelect(interaction: StringSelectMenuInteraction) {
    const selectedValue = interaction.values[0];
    console.log("Selected track index:", selectedValue);

    // 선택된 항목의 인덱스를 저장
    this.selectedTrackIndex = parseInt(selectedValue, 10);

    // 선택된 항목에 대한 작업을 수행
    await this.updatePlayer(interaction);
  }

  async pause(interaction: ButtonInteraction): Promise<void> {
    if (this.distubeVoice) {
      const queue = this.distube.getQueue(this.distubeVoice);
      if (queue) {
        if (queue.isPaused()) {
          await queue.resume();
        } else {
          await queue.pause();
        }
      }
      await this.updatePlayer(interaction);
    }
  }

  async stop(interaction?: ChatInputCommandInteraction): Promise<void> {
    if (this.distubeVoice) {
      const queue = this.distube.getQueue(this.distubeVoice);
      if (queue) {
        queue.stop();
        queue.songs = [];
        this.selectedTrackIndex = null;
      }
      if (this.messageId) {
        await this.deletePlayer();
      }
      if (interaction) {
        interaction.reply("음악 재생을 종료합니다.");
      }
      this.distubeVoice.leave();
    }
  }

  async clear(interaction?: ChatInputCommandInteraction): Promise<void> {
    if (this.distubeVoice) {
      const queue = this.distube.getQueue(this.distubeVoice);
      if (queue) {
        queue.songs = [];
        this.selectedTrackIndex = null;
      }
    }
    console.log(this.messageId);
    if (interaction) {
      await this.updatePlayer(interaction);
    } else {
      await this.updatePlayer();
    }
  }

  async skip(
    interaction?:
      | ChatInputCommandInteraction
      | ButtonInteraction
      | StringSelectMenuInteraction
  ): Promise<void> {
    if (this.distubeVoice) {
      const queue = this.distube.getQueue(this.distubeVoice);
      if (queue && (queue.songs.length > 1 || this.isAutoPlay)) {
        queue.skip();
        this.selectedTrackIndex = null;
      }
    }
    if (interaction) {
      await this.updatePlayer(interaction);
    } else {
      await this.updatePlayer();
    }
  }

  async autoPlay(interaction: ButtonInteraction) {
    if (this.distubeVoice) {
      const queue = this.distube.getQueue(this.distubeVoice);
      if (queue) {
        queue.toggleAutoplay();
        this.isAutoPlay = !this.isAutoPlay;
      }
    }
    this.updatePlayer(interaction);
  }

  private getEmbed(): EmbedBuilder {
    const queue = this.distube.getQueue(this.distubeVoice!);
    return new EmbedBuilder().setTitle("Music Player").addFields({
      name: "Now Playing",
      value: queue?.songs[0]?.name || "현재 재생중인 곡이 없습니다.",
    });
  }

  private getControlRow(): ActionRowBuilder<ButtonBuilder> {
    let isPaused, isPlaying, isNext;
    if (this.distubeVoice) {
      const queue = this.distube.getQueue(this.distubeVoice);
      if (queue) {
        isPaused = queue.isPaused();
        isPlaying = queue.isPlaying();
        isNext = this.isAutoPlay || queue.songs.length > 1;
        console.log(isPaused);
      } else {
        isPaused = true;
        isPlaying = false;
        isNext = false;
      }
    } else {
      isPaused = true;
      isPlaying = false;
      isNext = false;
    }
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("pause")
        .setLabel(isPaused ? "재생" : "일시정지")
        .setDisabled(!this.distube || !isPlaying) // 재생 중이 아니면 비활성화
        .setStyle(isPaused ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("skip")
        .setLabel("다음곡")
        .setDisabled(!this.distube || !isNext) // 다음곡이 없고 자동재생이 아니라면 비활성화
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("delete")
        .setLabel("삭제")
        .setDisabled(
          !this.distube || !isPlaying || this.selectedTrackIndex === null
        ) // 재생 중이 아니면 비활성화
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("playNow")
        .setLabel("즉시재생")
        .setDisabled(
          !this.distube || !isPlaying || this.selectedTrackIndex === null
        ) // 재생 중이 아니면 비활성화
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("autoPlay")
        .setLabel(`자동재생${this.isAutoPlay ? "ON" : "OFF"}`)
        .setDisabled(!this.distube) // 재생기가 없으면 비활성화
        .setStyle(this.isAutoPlay ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
  }

  private getSelectRow(): ActionRowBuilder<StringSelectMenuBuilder> {
    let options;
    if (this.distubeVoice) {
      const queue = this.distube.getQueue(this.distubeVoice);
      console.log(queue?.songs.slice(1).map((song) => song.name));
      if (queue && queue.songs.length > 1) {
        options = queue.songs.slice(1).map((song, index) => ({
          label: song.name ? song.name : `${index + 1}번째 곡`,
          description: `Track ${index + 1}`,
          value: (index + 1).toString(), // 고유 값으로 인덱스를 사용
          default: index + 1 === this.selectedTrackIndex,
        }));
      } else {
        options = [
          {
            label: "재생목록이 비어있습니다.",
            description: "새로운 곡을 추가해주세요.",
            value: "empty",
          },
        ];
      }
      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("track") // 고유 ID 설정
          .setPlaceholder(
            !queue || queue.songs.length <= 1
              ? "현재 재생목록에 곡이 없습니다."
              : "곡을 선택하여 삭제/즉시재생"
          )
          .setDisabled(!queue || queue.songs.length <= 1) // 비활성화
          .addOptions(options)
      );
    } else {
      return new ActionRowBuilder<StringSelectMenuBuilder>();
    }
  }
}
