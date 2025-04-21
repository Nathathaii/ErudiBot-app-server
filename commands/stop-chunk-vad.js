import { SlashCommandBuilder } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { chunkRecordings } from '../process/chunk_record.js';
import { getSummaryFromTranscribed } from '../process/summary_task-allocation.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stop-chunk-vad')
        .setDescription('Stops chunk-based recording and summarizes'),

    async execute(interaction) {
        const connection = getVoiceConnection(interaction.guildId);
        if (!connection) return interaction.reply("Bot is not in a voice channel!");

        await interaction.deferReply();

        let all_meeting_conversations = {};
        const userNames = [];

        for (const userName in chunkRecordings) {
            const { audioStream, interval, all_user_conversations, ongoingChunks } = chunkRecordings[userName];

            clearInterval(interval);
            audioStream.destroy();

            await Promise.allSettled(ongoingChunks);

            try{ 
                all_meeting_conversations = {
                  ...all_meeting_conversations,
                  ...all_user_conversations
                };
                userNames.push(userName)
            } catch {
                all_meeting_conversations = {
                  ...all_meeting_conversations,
                  ...all_user_conversations
                };
                userNames.push(`Unknown-${userName}`);
            }

            delete chunkRecordings[userName];
        }

        connection.destroy();

        const sortedConversationJson = Object.fromEntries(
          Object.entries(all_meeting_conversations).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
        );

        console.log(sortedConversationJson);

        try {
            await interaction.editReply(sortedConversationJson);
            // const summary = await getSummaryFromTranscribed(sortedConversationJson, userNames);
            // await interaction.editReply(summary);
        } catch (error) {
            console.error(error);
            await interaction.editReply("Error summarizing the meeting.");
        }
    }
};