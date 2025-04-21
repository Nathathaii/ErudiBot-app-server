import fs from 'fs/promises';
import { vadProcess } from './vad.js';
import { transcribeAudio } from "../external_api/whisper_api.js";

export async function getVadConversationFromRecords(userNames, resultFilePaths, startTime){
    const allConversations = {};
    
    await Promise.all(userNames.map(async (userName, i) => {
        const resultPath = resultFilePaths[i];

        try {
            const userConversationsDict = await vadProcess(resultPath);
            for (const [key, value] of Object.entries(userConversationsDict)) {
                const transcribedText = await transcribeAudio(value);
                allConversations[key + startTime] = [userName, transcribedText];

                //delete audio from value which is audio path
                console.log("try to delete vad processed file")
                try {
                    await fs.unlink(value);
                    console.log(`Deleted audio file: ${value}`);
                } catch (deleteError) {
                    console.error(`Error deleting file ${value}:`, deleteError);
                }
            }
            // //delete original audios from resultPath
            // console.log("try to delete original audio file")
            // try {
            //     await fs.unlink(resultPath);
            //     console.log(`Deleted original audio file: ${resultPath}`);
            // } catch (deleteError) {
            //     console.error(`Error deleting original file ${resultPath}:`, deleteError);
            // }

        } catch (error) {
            console.error(`Error processing ${userName}:`, error);
        }
    }));

    if (Object.keys(allConversations).length === 0) {
        console.error("No conversations were transcribed!");
        return "Sorry, no speech was detected.";
    }

    const sortedConversations = Object.fromEntries(
        Object.entries(allConversations).sort(([keyA], [keyB]) => parseFloat(keyA) - parseFloat(keyB))
    );
    return sortedConversations
}

export async function getMessageFromJsonResponse(jsonResponseText) {
    const jsonResponse = JSON.parse(jsonResponseText);
    if (!jsonResponse || !jsonResponse.message) {
        throw new Error("Invalid input: 'message' property is missing.");
    }

    // Extract JSON from Markdown block (if present)
    const jsonString = jsonResponse.message.startsWith("```json")
        ? jsonResponse.message.replace(/^```json\n/, '').replace(/\n```$/, '')
        : jsonResponse.message;

    // Parse JSON string
    let data;
    try {
        data = JSON.parse(jsonString);
        return data
    } catch (error) {
        throw new Error("Failed to parse JSON: " + error.message);
    }
}

export async function jsonToMarkdown(jsonResponseText) {
    const data = await getMessageFromJsonResponse(jsonResponseText);

    function formatValue(value, indent = "") {
        if (Array.isArray(value)) {
            return value.map(item => `\n${indent}- ${typeof item === 'object' ? formatValue(item, indent + "  ") : item}`).join("");
        } else if (typeof value === 'object' && value !== null) {
            return Object.entries(value)
                .map(([subKey, subValue]) => `\n${indent}**${subKey.replace(/_/g, " ")}:** ${formatValue(subValue, indent + "  ")}`)
                .join("");
        }
        return value;
    }

    return Object.entries(data)
        .map(([key, value]) => `# ${key.replace(/_/g, " ")}\n${formatValue(value)}`) //replace _ with spacepar
        .join("\n\n");
}

export async function jsonToMarkdownAddUsernames(jsonResponseText, userNames) {
    let data = await getMessageFromJsonResponse(jsonResponseText);
    data['participants'] = userNames

    function formatValue(value, indent = "") {
        if (Array.isArray(value)) {
            return value.map(item => `\n${indent}- ${typeof item === 'object' ? formatValue(item, indent + "  ") : item}`).join("");
        } else if (typeof value === 'object' && value !== null) {
            return Object.entries(value)
                .map(([subKey, subValue]) => `\n${indent}**${subKey.replace(/_/g, " ")}:** ${formatValue(subValue, indent + "  ")}`)
                .join("");
        }
        return value;
    }

    return Object.entries(data)
        .map(([key, value]) => `# ${key.replace(/_/g, " ")}\n${formatValue(value)}`) //replace _ with spacepar
        .join("\n\n");
}


//not working yet
export function markdownToJson(markdown) {
    const lines = markdown.split('\n');
    const result = {};
    let currentKey = null;
    let stack = [];
    let currentObj = result;
    let pendingListItem = null;

    const getIndentLevel = (line) => line.search(/\S|$/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Section header
        if (line.startsWith('# ')) {
            currentKey = line.substring(2).replace(/ /g, '_').trim(); // trim to remove \r
            result[currentKey] = {};
            currentObj = result[currentKey];
            stack = [{ indent: 0, obj: currentObj }];
            continue;
        }

        const indent = getIndentLevel(line);
        const trimmed = line.trim();

        if (stack.length === 0) {
            console.warn(`⚠️ Skipping line before any header section: "${line}"`);
            continue;
        }

        // Handle list start (hyphen-only line)
        if (trimmed === '-') {
            pendingListItem = { indent, obj: {} };
            continue;
        }

        // List item or key-value inside a list
        const match = trimmed.match(/\*\*(.+?)\*\*:\s*(.*)/);
        if (match) {
            const [, rawKey, rawValue] = match;
            const key = rawKey.replace(/ /g, '_').trim();
            const isNested = rawValue === '';
            const value = rawValue.trim();

            while (stack.length && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }

            if (stack.length === 0) {
                console.warn(`⚠️ No valid parent found for key-value at line ${i + 1}: "${line}"`);
                continue;
            }

            const parent = stack[stack.length - 1].obj;

            if (pendingListItem) {
                pendingListItem.obj[key] = isNested ? {} : value;
                if (isNested) {
                    stack.push({ indent, obj: pendingListItem.obj[key] });
                }

                // Check if the next line(s) will keep adding to this item
                const nextLine = lines[i + 1]?.trim();
                const isNextListItem = nextLine && nextLine.startsWith('-');
                if (!isNextListItem) {
                    if (!Array.isArray(parent)) {
                        const lastKey = Object.keys(parent).pop();
                        parent[lastKey] = [pendingListItem.obj];
                    } else {
                        parent.push(pendingListItem.obj);
                    }
                    pendingListItem = null;
                }

            } else {
                parent[key] = isNested ? {} : value;
                if (isNested) {
                    stack.push({ indent, obj: parent[key] });
                }
            }
            continue;
        }

        // Plain list values like: - participant
        if (trimmed.startsWith('- ')) {
            while (stack.length && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }

            if (stack.length === 0) {
                console.warn(`⚠️ No valid parent found for list item at line ${i + 1}: "${line}"`);
                continue;
            }

            const parent = stack[stack.length - 1].obj;

            if (!Array.isArray(parent)) {
                const key = Object.keys(parent).pop();
                parent[key] = [trimmed.slice(2).trim()];
                stack.push({ indent, obj: parent[key] });
            } else {
                parent.push(trimmed.slice(2).trim());
            }
        }
    }

    return result;
}




export async function readTextFile(textFilePath){
    try{
        const data = await fs.readFile(textFilePath, 'utf8');
        return data;
    }catch(err){
        console.error('Error reading the file:', err);
    }
}

export function CVDistributed(taskAllocationJson) {
    const userWorkload = {};

    // Collect total estimated time per user
    for (const task of taskAllocationJson['tasks']) {
        for (const subtask of task.subtasks) {
            const user = subtask.assigned_to;
            const estimatedTime = parseFloat(subtask.estimated_time); // Ensure number

            if (!userWorkload[user]) {
                userWorkload[user] = 0;
            }
            userWorkload[user] += estimatedTime;
        }
    }

    const workHours = Object.values(userWorkload);
    if (workHours.length <= 1) return true; // Only one user, no variation

    // Calculate mean (µ)
    const mean = workHours.reduce((sum, val) => sum + val, 0) / workHours.length;

    // Calculate standard deviation (σ)
    const squaredDiffs = workHours.map(val => Math.pow(val - mean, 2));
    const stdDev = Math.sqrt(squaredDiffs.reduce((sum, val) => sum + val, 0) / workHours.length);

    // Calculate CV (%)
    const cv = (stdDev / mean) * 100;

    return cv 
}

export async function TranscribedConversationJsonToText(jsonConversation){

    const result = Object.entries(jsonConversation)
        .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
        .map(([_, [speaker, data]]) => `${speaker}: ${data.text}`)
        .join('\n');
    return result;
}

export function extractParticipants(meetingSummary) {
    const lines = meetingSummary.split('\n');
    const participants = [];

    let isInParticipantsSection = false;

    for (let line of lines) {
        line = line.trim();

        if (line.toLowerCase().startsWith('# participants')) {
            isInParticipantsSection = true;
            continue;
        }

        if (isInParticipantsSection) {
            // Stop if a new header starts
            if (line.startsWith('#')) break;

            // Collect participant lines that start with "- "
            if (line.startsWith('- ')) {
                const name = line.substring(2).trim();
                if (name) participants.push(name);
            }
        }
    }

    if (participants.length === 0) {
        console.error("User names not found in the meeting summary.");
        return [];
    }

    return participants;
}
