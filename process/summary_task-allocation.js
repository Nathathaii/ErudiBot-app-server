import { chatGPTMessage, chatGPTMessageJson } from "../external_api/chatgpt-api.js";
import { correctTranscriptPrompt, summarizePrompt, taskPlanningPrompt, singleTaskAgentPrompt, taskAllocationPrompt, reflectionPatternPrompt} from "./prompts.js";
import fs from 'fs/promises';
import * as Helper from './helper.js'

export async function getSummaryFromRecords(userNames, resultFilePaths) {
    const sortedConversations = await Helper.getVadConversationFromRecords(userNames, resultFilePaths, 0)
    let meetingSummary = await getSummaryFromTranscribed(sortedConversations, userNames)

    return meetingSummary;
}

export async function getSummaryFromTranscribed(allConversationsJson, userNames) {
    try {
        const allConverastionsText = await Helper.TranscribedConversationJsonToText(allConversationsJson)
        console.log(allConverastionsText);
        //1. Correct transcription text
        const correctTextPrompt = await correctTranscriptPrompt(allConverastionsText);
        const correctConversations = await chatGPTMessageJson(correctTextPrompt);
        
        const correctConversationsJson = await Helper.getMessageFromJsonResponse(correctConversations)
        console.log("Step 1 :Correct Conversation --------------------------------------------------------------------")
        console.log(correctConversationsJson)

        //2. GPT Prompt For Summary + Topic Interest
        const summaryTextPrompt = await summarizePrompt(correctConversations, userNames);
        const meetingSummary = await chatGPTMessageJson(summaryTextPrompt);
        //2.2. Add user names to response
        const meetingSummaryMarkdown = await Helper.jsonToMarkdownAddUsernames(meetingSummary, userNames);
        console.log("Step 2 :Summarize Meeting --------------------------------------------------------------------")
        console.log(meetingSummaryMarkdown)
        return meetingSummaryMarkdown;

    } catch (error) {
        console.error("Error in getSummaryFromTranscribedText:", error);
        return "Error processing transcription.";
    }
}



//used for test and debug
export async function getSummaryFromTranscribedTextPath(transcribedPaths, userNames) {
    try {
        const fileContent = await fs.readFile(transcribedPaths, 'utf-8');  // Corrected readFile usage
        const allConversationsJson = JSON.parse(fileContent);

        const meetingSummaryMarkdown = await getSummaryFromTranscribed(allConversationsJson, userNames);
        return meetingSummaryMarkdown;

    } catch (error) {
        console.error("Error in getSummaryFromTranscribedText:", error);
        return "Error processing transcription.";
    }
}

//used for test and debug
export async function getSummaryFromCorrectTranscribedTextPath(CorrectedtranscribedPaths, userNames) {
    try {
        const correctConversations = Helper.readTextFile(CorrectedtranscribedPaths);

        //2. GPT Prompt For Summary + Topic Interest
        const summaryTextPrompt = await summarizePrompt(correctConversations, userNames);
        const meetingSummary = await chatGPTMessageJson(summaryTextPrompt);
        //2.2. Add user names to response
        const meetingSummaryMarkdown = await Helper.jsonToMarkdownAddUsernames(meetingSummary, userNames);
        console.log("Step 2 :Summarize Meeting --------------------------------------------------------------------")
        return meetingSummaryMarkdown;

    } catch (error) {
        console.error("Error in getSummaryFromTranscribedText:", error);
        return "Error processing transcription.";
    }
}

export async function getTaskAllocationFromSummary(meetingSummary, userNames){
    try{
        const meetingSummaryJson = await Helper.getMessageFromJsonResponse(meetingSummary);
        if (!meetingSummaryJson || !meetingSummaryJson["topic_interest"] || !meetingSummaryJson["task_list"]) {
            throw new Error("Invalid meeting summary format.");
        }
        const topicInterest = meetingSummaryJson["topic_interest"]
        // console.log("topic interest:")
        // console.log(topicInterest)

        //3&4. GPT Prompt for Task Planning  
        const userNumber = userNames.length
        const taskList = meetingSummaryJson["task_list"]
        const allTasksPlan = []
        for (const taskItem of taskList){
            const task = taskItem.task;
            const taskPlanningTextPrompt = await taskPlanningPrompt(meetingSummaryJson, task, userNumber);
            const taskPlanning = await chatGPTMessageJson(taskPlanningTextPrompt);
            const taskPlanJson = await Helper.getMessageFromJsonResponse(taskPlanning);
            allTasksPlan.push(taskPlanJson)
        }
        console.log("Step 3 and 4 :All task plan------------------------------------------------------------------------------")
        console.log(allTasksPlan);

        if (allTasksPlan.length === 0) {
            throw new Error("No tasks planned. Task list may be empty or processing failed.");
        }

        //5. Prompt GPT for Task Allocation
        const taskAllocationTextPrompt = await taskAllocationPrompt(allTasksPlan, userNames, topicInterest);
        const taskAllocation = await chatGPTMessageJson(taskAllocationTextPrompt);
        let taskAllocationJson = await Helper.getMessageFromJsonResponse(taskAllocation);
        console.log("Step 5 :All task plan------------------------------------------------------------------------------------")
        console.log("task allocation: ");
        console.log(taskAllocationJson)
        
        // //6. Prompt GPT for Reflection Pattern 
        let cv = await Helper.CVDistributed(taskAllocationJson)
        let isGood = cv <= 20;
        console.log("Step 6 :Reflection--------------------------------------------------------------------------------------")
        console.log("is good");
        console.log(isGood)
        let reflectionResult = taskAllocation;

        while(isGood !== true){
            let reflecTaskAllocationTextPrompt = await reflectionPatternPrompt(taskAllocationJson, cv)
            reflectionResult = await chatGPTMessageJson(reflecTaskAllocationTextPrompt)
            taskAllocationJson = await Helper.getMessageFromJsonResponse(reflectionResult);
            cv = await Helper.CVDistributed(taskAllocationJson)
            isGood = cv <= 20;
            break; //i just break to see if the logic work. remove this for further development.
        }
        const taskAllocationResult = await Helper.jsonToMarkdown(reflectionResult)

        return taskAllocationResult;
    } catch (error) {
        console.error("Error: ", error);
        return "Error processing task allocation.";
    }
}