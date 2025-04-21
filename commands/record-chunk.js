import { SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel, EndBehaviorType } from '@discordjs/voice';
import fs from 'fs';
import prism from 'prism-media';
import { transcribeAudio } from '../external_api/whisper_api.js';
import { chunkRecordings } from '../process/chunk_record.js';
import { exec } from 'child_process';

const CHUNK_DURATION_MS = 30_000; // 30 seconds


export default {
    data: new SlashCommandBuilder()
        .setName('record-chunk')
        .setDescription('Records in chunks and processes audio during the meeting'),

    async execute(interaction) {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) return interaction.reply("You must be in a voice channel!");

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        const receiver = connection.receiver;
        await interaction.reply("Started chunk-based recording... 🎧");

        receiver.speaking.on('start', (userId) => {
            if (chunkRecordings[userId]) return;

            const audioStream = receiver.subscribe(userId, {
                end: { behavior: EndBehaviorType.Manual }
            });

            const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
            const pcmStream = audioStream.pipe(decoder);

            const buffers = [];
            pcmStream.on('data', chunk => buffers.push(chunk));

            const transcripts = [];

            const interval = setInterval(async () => {
                if (buffers.length === 0) return;

                const chunkData = Buffer.concat(buffers.splice(0));
                const chunkPath = `./recordings/chunk_${userId}_${Date.now()}.pcm`;
                fs.writeFileSync(chunkPath, chunkData);

                const wavPath = chunkPath.replace('.pcm', '.wav');
                await new Promise((res, rej) => {
                    const cmd = `ffmpeg -f s16le -ar 48k -ac 1 -i "${chunkPath}" "${wavPath}"`;
                    exec(cmd, (err) => {
                        if (err) rej(err); else res();
                    });
                });
                fs.unlinkSync(chunkPath);

                const text = await transcribeAudio(wavPath);
                transcripts.push(text);
                fs.unlinkSync(wavPath);
            }, CHUNK_DURATION_MS);

            chunkRecordings[userId] = {
                audioStream,
                decoder,
                buffers,
                interval,
                transcripts,
            };

            audioStream.on('end', () => console.log(`Stopped receiving from ${userId}`));
        });
    }
};