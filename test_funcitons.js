import { getSummaryFromRecords,
        getSummaryFromTranscribedTextPath,
        getTaskAllocationFromSummary,
        getSummaryFromCorrectTranscribedTextPath
 } from "./process/summary_task-allocation.js"
import * as Helper from "./process/helper.js"

// //--------------test summary from record------------------------------------------
// const userNames = ['ItsRitte', 'NaThatHai', 'myo']
// const resultFilePaths = ['C:/Users/Nathathai/Documents/chula_XD/ErudiBot/ErudiBot-app-server/recordings/198624703538003968_20250321T140113.wav',
//                         'C:/Users/Nathathai/Documents/chula_XD/ErudiBot/ErudiBot-app-server/recordings/860527000616042536_20250321T140113.wav',
//                         'C:/Users/Nathathai/Documents/chula_XD/ErudiBot/ErudiBot-app-server/recordings/363311465077145600_20250321T140113.wav'
// ]
// const summary = await getSummaryFromRecords(userNames, resultFilePaths)
// console.log(summary)

// //----------------test only summary from transcribed text (whisper)----------------------------
// const transcribedPaths = './test_results/transcribed.json';
// const userNames = [ 'ItsRitte', 'NaThatHai', 'myo' ]
// try {
//     const meetingSummaryMarkdown = await getSummaryFromTranscribedTextPath(transcribedPaths, userNames);
//     console.log(meetingSummaryMarkdown)
// } catch (err) {
//     console.error(err);
// }

//-----------------test corrected transcribed conversation-----------------------------------------
// const correctedtranscribedPaths = './test_results/conversations_scenario2.txt';
// const userNames = [ 'ItsRitte', 'NaThatHai', 'myo' ]
// try {
//     const meetingSummaryMarkdown = await getSummaryFromCorrectTranscribedTextPath(correctedtranscribedPaths, userNames);
//     console.log(meetingSummaryMarkdown)
// } catch (err) {
//     console.error(err);
// }

// // ---------------test both summarize and task allocation function------------- (didn't test this yet. if bug just stay patient)
// try {
//     const transcribedPaths = './test_results/transcribed.json';
//     const userNames = ['ItsRitte', 'NaThatHai', 'myo'];
//     const meetingSummary = await getSummaryFromTranscribedTextPath(transcribedPaths);
//     const taskAllocation = await getTaskAllocationFromSummary(meetingSummary, userNames);
//     console.log(taskAllocation);
// } catch (err) {
//     console.error(err);
// }

// const correctedtranscribedPaths = './test_results/conversations_scenario2.txt';
// const userNames = [ 'ItsRitte', 'NaThatHai', 'myo' ]
// try {
//     const meetingSummaryMarkdown = await getSummaryFromCorrectTranscribedTextPath(correctedtranscribedPaths, userNames);
//     const taskAllocation = await getTaskAllocationFromSummary(meetingSummaryMarkdown, userNames);
//     console.log(taskAllocation);
// } catch (err) {
//     console.error(err);
// }

// // --------------example of how to use readTextFile function ------------------------

// const textFilePath = './test_results/meeting_test_sumary2.txt'
// const textResult = await Helper.readTextFile(textFilePath)
// // console.log(textResult)

// // const jsonResult = await Helper.markdownToJson(textResult);
// // console.log(jsonResult)

// const participants = Helper.extractParticipants(textResult);
// console.log(participants);

// Let's say you already have two parts:
const conversationJson1 = {
    "0": ["NaThatHai", { "text": "Hello 1", "executionTime": "3.1 seconds" }],
    "3.5": ["ItsRitte", { "text": "Hi!", "executionTime": "2.0 seconds" }]
  };
  
  const conversationJson2 = {
    "6.0": ["NaThatHai", { "text": "Okay", "executionTime": "1.8 seconds" }],
    "8.1": ["ItsRitte", { "text": "Cool", "executionTime": "1.5 seconds" }]
  };
  
  // Combine into one object
  const conversationJson = {
    ...conversationJson1,
    ...conversationJson2
  };

  console.log(conversationJson)
  
  // Optional: sort keys numerically if you want chronological order
  const sortedConversationJson = Object.fromEntries(
    Object.entries(conversationJson).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
  );
  
  console.log(sortedConversationJson);