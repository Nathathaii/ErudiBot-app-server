import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

ffmpeg.setFfmpegPath(ffmpegPath);
/**
 * Extracts speech segments using FFmpeg.
 * @param {string} wavFilePath - Path to the original WAV file.
 * @returns {Promise<Object>} - Dictionary mapping segment start times to file paths.
 */
export async function vadProcess(wavFilePath) {

    const timestamps = await getSpeechTimestamps(wavFilePath);
    console.log(`timestamps: ${timestamps}`)
    if (timestamps.length < 2) {
        throw new Error("No speech detected");
    }

    let outputDict = {};
    let segmentIndex = 0;
    
    for (let i = 0; i < timestamps.length - 1; i += 2) {
        const start = timestamps[i];
        const end = timestamps[i + 1];
        const outputFilePath = wavFilePath.replace('.wav', `_${segmentIndex}.wav`);
        segmentIndex++;

        await extractSegment(wavFilePath, outputFilePath, start, end);
        outputDict[start] = outputFilePath;
    }

    return outputDict;
}

/**
 * Uses FFmpeg to extract a specific speech segment.
 */
function extractSegment(inputPath, outputPath, startTime, endTime) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .setStartTime(startTime)
            .setDuration(endTime - startTime)
            .output(outputPath)
            .on('end', () => {
                console.log(`Extracted segment: ${outputPath}`);
                resolve();
            })
            .on('error', (err) => reject(err))
            .run();
    });
}

/**
 * Runs FFmpeg silence detection to extract speech timestamps.
 * @param {string} wavFilePath - Path to the WAV file.
 * @returns {Promise<Array>} - Array of speech timestamps.
 */
async function getSpeechTimestamps(wavFilePath) {
    const temp_path = 'temp.wav'
    const audioEndTime = await getAudioEndTime(wavFilePath);

    return new Promise((resolve, reject) => {
        let output = '';
        
        ffmpeg()
            .input(wavFilePath)
            .audioFilters('silencedetect=noise=-40dB:d=0.5')
            .output(temp_path)
            .on('stderr', (stderrLine) => {
                output += stderrLine;
            })
            .on('end', () => {
                const silenceTimestamps = [];
                const speechTimestamps = [];
                const regex = /silence_(start|end): (\d+(\.\d+)?)/g;
                let match;

                while ((match = regex.exec(output)) !== null) {
                    silenceTimestamps.push({ type: match[1], time: parseFloat(match[2]) });
                }
                let lastEnd = 0; 

                if(silenceTimestamps.length < 2){ //in case there is no silence
                    deleteTempFile(temp_path);
                    resolve([0,audioEndTime])
                }

                for (let i = 0; i < silenceTimestamps.length; i++) {
                    const { type, time } = silenceTimestamps[i];
                    if (type === 'start') {
                        speechTimestamps.push(lastEnd, time);
                    } else {
                        lastEnd = time;
                    }
                }

                if (lastEnd < audioEndTime) {
                    speechTimestamps.push(lastEnd, audioEndTime);
                }

                console.log(`speech time stamps: ${speechTimestamps}`)
                deleteTempFile(temp_path);
                resolve(speechTimestamps);
            })
            .on('error', (err) => {
                deleteTempFile(temp_path);
                reject(`FFmpeg error: ${err.message}`);
            })
            .run();
    });
}



async function getAudioEndTime(wavFilePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(wavFilePath, (err, metadata) => {
            if (err) {
                reject(`FFmpeg error: ${err.message}`);
                return;
            }
            const duration = metadata.format.duration;
            resolve(duration);
        });
    });
}

function deleteTempFile(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error(`Failed to delete temp file: ${filePath}`, err);
            } else {
                console.log(`Temp file deleted: ${filePath}`);
            }
        });
    }
}





// // Example usage:
// const absoluteWavFilePath = 'C:/Users/Nathathai/Documents/chula_XD/ErudiBot/ErudiBot-app-server/recordings/860527000616042536_20250319T044212.wav'


// vadProcess(absoluteWavFilePath)
//     .then((result) => console.log(result))
//     .catch((error) => console.error("Error:", error));

