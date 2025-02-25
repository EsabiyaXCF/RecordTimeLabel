// 處理存儲相關邏輯
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveData") {
    chrome.storage.local.set({ recordedTimes: request.data });
  }
});