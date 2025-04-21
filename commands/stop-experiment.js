import { SlashCommandBuilder } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { chunkRecordings } from '../process/chunk_record.js';
import { getSummaryFromTranscribed } from '../process/summary_task-allocation.js';
import { getVadConversationFromRecords } from '../process/helper.js';
import fs from 'fs';

export default {
  data: new SlashCommandBuilder()
    .setName('stop-experiment')
    .setDescription('Stops recording and summarizes (Moderators will not be in the record)'),

  async execute(interaction) {
    const connection = getVoiceConnection(interaction.guildId);
    if (!connection) return interaction.reply("Bot is not in a voice channel!");

    await interaction.deferReply();

    // Stop all intervals and destroy streams
    for (const timestamp in chunkRecordings) {
      if (timestamp.startsWith('_')) continue; // ignore metadata keys

      const userMap = chunkRecordings[timestamp];
      for (const userId in userMap) {
        const data = userMap[userId];
        if (data.interval) clearInterval(data.interval);
        if (data.audioStream) data.audioStream.destroy();
      }
    }

    connection.destroy();

    const allChunks = [];

    // Process each chunk (sorted by timestamp)
    const sortedTimestamps = Object.keys(chunkRecordings)
      .filter(t => !t.startsWith('_'))
      .sort((a, b) => Number(a) - Number(b));

    for (const timestamp of sortedTimestamps) {
      const userMap = chunkRecordings[timestamp]; // userId -> wavPath
      const userNames = [];
      const recordPaths = [];

      for (const userId in userMap) {
        const wavPath = userMap[userId];

        try {
          const member = await interaction.guild.members.fetch(userId);
          userNames.push(member.user.username);
        } catch {
          userNames.push(`Unknown-${userId}`);
        }

        recordPaths.push(wavPath);
      }

      try {
        const chunkResult = await getVadConversationFromRecords(userNames, recordPaths, timestamp); // returns { [second]: [name, {text, executionTime}] }

        // Append results from this chunk into overall list
        for (const sec in chunkResult) {
          allChunks.push([parseFloat(sec), chunkResult[sec]]);
        }

        // Clean up .wav files
        for (const wavPath of recordPaths) {
          if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
        }
      } catch (err) {
        console.error(`Error processing chunk at ${timestamp}:`, err);
      }
    }

    // Sort final output by time (in case timestamps overlap)
    allChunks.sort((a, b) => a[0] - b[0]);

    // Flatten to final transcript string
    const fullTranscript = allChunks
      .map(([sec, [username, data]]) => `[${username}] ${data.text}`)
      .join('\n');

    try {
      const summary = await getSummaryFromTranscribed(fullTranscript);
      await interaction.editReply(summary);
    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Error summarizing the meeting.");
    }

    // Final cleanup
    for (const key in chunkRecordings) delete chunkRecordings[key];
  }
};
