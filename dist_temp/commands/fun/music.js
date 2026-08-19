"use strict";
import {
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";
import { useMainPlayer } from "discord-player";
export const data = new SlashCommandBuilder().setName("music").setDescription("Music system").addSubcommand(
  (sub) => sub.setName("play").setDescription("Play a song").addStringOption(
    (option) => option.setName("query").setDescription("Song name or URL").setRequired(true)
  )
).addSubcommand((sub) => sub.setName("skip").setDescription("Skip the current song")).addSubcommand((sub) => sub.setName("stop").setDescription("Stop the music and leave")).addSubcommand((sub) => sub.setName("queue").setDescription("Show the current queue"));
export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const player = useMainPlayer();
  if (!player) {
    await interaction.reply({ content: "Music player is not initialized.", ephemeral: true });
    return;
  }
  const member = interaction.member;
  if (!member.voice.channel) {
    await interaction.reply({ content: "You must be in a voice channel!", ephemeral: true });
    return;
  }
  if (subcommand === "play") {
    await interaction.deferReply();
    const query = interaction.options.getString("query", true);
    try {
      const { track } = await player.play(member.voice.channel, query, {
        nodeOptions: {
          metadata: interaction
        }
      });
      const embed = new EmbedBuilder().setTitle("\u{1F3B6} Added to Queue").setDescription(`**[${track.title}](${track.url})**
By: ${track.author}`).setThumbnail(track.thumbnail).setColor("#8B5CF6");
      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      await interaction.editReply(`Error playing track: ${e.message}`);
    }
  } else if (subcommand === "skip") {
    const queue = player.nodes.get(interaction.guildId);
    if (!queue || !queue.isPlaying()) {
      await interaction.reply({ content: "Nothing is currently playing.", ephemeral: true });
      return;
    }
    queue.node.skip();
    await interaction.reply("\u23ED\uFE0F Skipped the current track.");
  } else if (subcommand === "stop") {
    const queue = player.nodes.get(interaction.guildId);
    if (!queue || !queue.isPlaying()) {
      await interaction.reply({ content: "Nothing is currently playing.", ephemeral: true });
      return;
    }
    queue.delete();
    await interaction.reply("\u{1F6D1} Stopped the music and cleared the queue.");
  } else if (subcommand === "queue") {
    const queue = player.nodes.get(interaction.guildId);
    if (!queue || !queue.isPlaying()) {
      await interaction.reply({ content: "Nothing is currently playing.", ephemeral: true });
      return;
    }
    const currentTrack = queue.currentTrack;
    const tracks = queue.tracks.toArray();
    let description = `**Currently Playing:**
[${currentTrack?.title}](${currentTrack?.url})

**Next Up:**
`;
    if (tracks.length === 0) {
      description += "The queue is empty.";
    } else {
      const nextTracks = tracks.slice(0, 10).map((t, i) => `${i + 1}. [${t.title}](${t.url})`);
      description += nextTracks.join("\n");
      if (tracks.length > 10) {
        description += `
...and ${tracks.length - 10} more tracks.`;
      }
    }
    const embed = new EmbedBuilder().setTitle("Music Queue").setDescription(description).setColor("#8B5CF6");
    await interaction.reply({ embeds: [embed] });
  }
}
