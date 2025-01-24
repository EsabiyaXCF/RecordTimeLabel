// 時間元素選擇器
const TIME_SELECTOR = '.live-time > span[aria-hidden="true"]';
const STREAM_TITLE_SELECTOR = 'p[data-a-target="stream-title"]';

// 主消息處理器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Content] Received request:', request);

  switch(request.action) {
    case "getCurrentTime":
      handleGetTime(sendResponse);
      return true;

    case "validateSelector":
      handleValidateSelector(sendResponse);
      return true;
    case "getStreamTitle":
        handleGetStreamTitle(sendResponse);
        return true;
    default:
      sendResponse({ error: '未知操作類型' });
  }
});
function handleGetStreamTitle(sendResponse) {
    const titleElement = document.querySelector(STREAM_TITLE_SELECTOR);
    sendResponse({
      exists: !!titleElement,
      title: titleElement?.textContent.trim() || '未命名直播',
      elementHTML: titleElement?.outerHTML || ''
    });
  }
// 處理獲取時間請求
function handleGetTime(sendResponse) {
  const timeElement = document.querySelector(TIME_SELECTOR);
  
  if (!timeElement) {
    console.error('[Content] 時間元素不存在');
    return sendResponse({ 
      success: false,
      error: "DOM_ELEMENT_NOT_FOUND"
    });
  }

  const rawTime = timeElement.textContent.trim();
  const isValid = /^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(rawTime);

  sendResponse({
    success: isValid,
    time: isValid ? rawTime : null,
    rawElementText: timeElement.textContent,
    timestamp: new Date().toISOString()
  });
}

// 處理選擇器驗證
function handleValidateSelector(sendResponse) {
  const elementExists = !!document.querySelector(TIME_SELECTOR);
  sendResponse({ 
    valid: elementExists,
    selector: TIME_SELECTOR,
    documentState: document.readyState 
  });
}