import { SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel, EndBehaviorType } from '@discordjs/voice';
import fs from 'fs';
import prism from 'prism-media';
import { exec } from 'child_process';
import { chunkRecordings, userBuffers } from '../process/chunk_record.js'; // new structure

const CHUNK_DURATION_MS = 30_000;
const IGNORED_USER_IDS = new Set([
  '198624703538003968', //ritte
  '363311465077145600', //myo
  '860527000616042536', //prae
]);

export default {
  data: new SlashCommandBuilder()
    .setName('record-experiment')
    .setDescription('Records to summarize the meeting (Moderators will not be in the record)'),

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

    // Global interval for all users
    const interval = setInterval(async () => {
      const timestamp = Date.now();
      chunkRecordings[timestamp] = {};

      const userIds = Object.keys(userBuffers);

      for (const userId of userIds) {
        const { userName, buffers } = userBuffers[userId];
        if (!buffers || buffers.length === 0) continue;

        const chunkData = Buffer.concat(buffers.splice(0));
        const chunkPath = `./recordings/chunk_${userName}_${timestamp}.pcm`;
        fs.writeFileSync(chunkPath, chunkData);

        const wavPath = chunkPath.replace('.pcm', '.wav');
        await new Promise((res, rej) => {
          const cmd = `ffmpeg -f s16le -ar 48k -ac 1 -i "${chunkPath}" "${wavPath}"`;
          exec(cmd, (err) => (err ? rej(err) : res()));
        });

        if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
        chunkRecordings[timestamp][userName] = wavPath;
      }
    }, CHUNK_DURATION_MS);

    receiver.speaking.on('start', async (userId) => {
      if (IGNORED_USER_IDS.has(userId)) return;
      if (userBuffers[userId]) return;

      const member = await interaction.guild.members.fetch(userId);
      const userName = member.user.username;

      const audioStream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.Manual },
      });

      const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
      const pcmStream = audioStream.pipe(decoder);

      userBuffers[userId] = { userName, buffers: [] };

      pcmStream.on('data', chunk => userBuffers[userId].buffers.push(chunk));
      audioStream.on('end', () => console.log(`Stopped receiving from ${userId}`));
    });

    // Store the interval so it can be cleared later
    chunkRecordings._globalInterval = interval;
    chunkRecordings._connection = connection;
  }
};
