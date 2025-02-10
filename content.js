// 時間元素選擇器
const LIVE_TIME_SELECTOR = '.live-time > span[aria-hidden="true"]';
const VOD_TIME_SELECTOR = '.CoreText-sc-1txzju1-0.ckwzla';
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
    case "getVideoId":
      (async () => {
        const currentUrl = window.location.href;
        const urlA = new URL('/videos', currentUrl).href;
        const videoId = await getVideoIdFromUrlA(urlA);
        sendResponse({ videoId });
      })();
      return true;
    case "getChannelUrl":
      (async () => {
        await handleGetChannelUrl(sendResponse);
      })();
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
  async function getVideoIdFromUrlA(urlA) {
  try {
    const response = await fetch(urlA);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 使用更穩定的選擇器（改用 data-test-selector）
    const link = doc.querySelector('a[data-test-selector="video-card-meta__link"]');
    if (!link) return null;
    
    const href = link.getAttribute('href');
    const videoIdMatch = href.match(/\/videos\/(\d+)/);
    return videoIdMatch ? videoIdMatch[1] : null;
  } catch (error) {
    console.error('[Content] 获取视频ID失败:', error);
    return null;
  }
}
// 處理獲取時間請求
function handleGetTime(sendResponse) {
  // 先嘗試獲取直播時間
  let timeElement = document.querySelector(LIVE_TIME_SELECTOR);
  let isLiveStream = true;
  
  // 如果找不到直播時間，嘗試獲取影片時間
  if (!timeElement) {
    timeElement = document.querySelector(VOD_TIME_SELECTOR);
    isLiveStream = false;
  }
  
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
    timestamp: new Date().toISOString(),
    isLiveStream: isLiveStream
  });
}

// 處理選擇器驗證
function handleValidateSelector(sendResponse) {
  const liveElementExists = !!document.querySelector(LIVE_TIME_SELECTOR);
  const vodElementExists = !!document.querySelector(VOD_TIME_SELECTOR);
  
  sendResponse({ 
    valid: liveElementExists || vodElementExists,
    selector: liveElementExists ? LIVE_TIME_SELECTOR : VOD_TIME_SELECTOR,
    documentState: document.readyState,
    isLiveStream: liveElementExists
  });
}

// 修改獲取頻道 URL 的函數
async function handleGetChannelUrl(sendResponse) {
  try {
    const currentUrl = window.location.href;
    
    // 檢查是否在影片頁面
    const videoMatch = currentUrl.match(/^https:\/\/www\.twitch\.tv\/videos\/(\d+)/);
    if (videoMatch) {
      // 如果是影片頁面，直接使用當前網址
      console.log('[Content] 當前在影片頁面，使用當前URL');
      return sendResponse({ url: `https://www.twitch.tv/videos/${videoMatch[1]}` });
    }

    // 如果不是影片頁面，使用原有的直播頁面邏輯
    const channelLink = document.querySelector('.Layout-sc-1xcs6mc-0.kpHsJz.avatar--t0iT1 a');
    if (!channelLink) {
      console.error('[Content] 找不到頻道連結');
      return sendResponse({ url: null });
    }

    const href = channelLink.getAttribute('href');
    if (!href) {
      console.error('[Content] 頻道連結無效');
      return sendResponse({ url: null });
    }

    // 從 href 中提取用戶名
    const username = href.replace('/', '');
    console.log('[Content] 頻道用戶名:', username);

    // 使用 GQL API 獲取影片
    const gqlEndpoint = 'https://gql.twitch.tv/gql';
    const query = [{
      operationName: 'FilterableVideoTower_Videos',
      variables: {
        limit: 1,
        channelOwnerLogin: username,
        broadcastType: 'ARCHIVE',
        videoSort: 'TIME'
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: 'a937f1d22e269e39a03b509f65a7490f9fc247d7f83d6ac1421523e3b68042cb'
        }
      }
    }];

    const response = await fetch(gqlEndpoint, {
      method: 'POST',
      headers: {
        'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    });

    const data = await response.json();
    console.log('[Content] GQL 回應:', data);

    // 從回應中提取影片資訊
    const videos = data[0]?.data?.user?.videos?.edges;
    if (!videos || videos.length === 0) {
      console.log('[Content] 找不到影片，返回影片列表頁面');
      return sendResponse({ url: `https://www.twitch.tv${href}/videos` });
    }

    // 構建影片 URL
    const videoId = videos[0].node.id;
    const finalUrl = `https://www.twitch.tv/videos/${videoId}`;
    
    console.log('[Content] 生成的影片URL:', finalUrl);
    sendResponse({ url: finalUrl });

  } catch (error) {
    console.error('[Content] 獲取影片URL失敗:', error);
    sendResponse({ url: null });
  }
}