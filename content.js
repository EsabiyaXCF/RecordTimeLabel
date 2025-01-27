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

// 修改獲取頻道 URL 的函數
async function handleGetChannelUrl(sendResponse) {
  try {
    // 1. 先獲取頻道連結
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

    // 2. 從 href 中提取用戶名
    const username = href.replace('/', '');
    console.log('[Content] 頻道用戶名:', username);

    // 3. 使用 GQL API 獲取影片
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

    // 4. 從回應中提取影片資訊
    const videos = data[0]?.data?.user?.videos?.edges;
    if (!videos || videos.length === 0) {
      console.log('[Content] 找不到影片，返回影片列表頁面');
      return sendResponse({ url: `https://www.twitch.tv${href}/videos` });
    }

    // 5. 構建影片 URL（修改這裡）
    const videoId = videos[0].node.id;
    // 直接使用 videoId，不需要包含頻道名稱
    const finalUrl = `https://www.twitch.tv/videos/${videoId}`;
    
    console.log('[Content] 生成的影片URL:', finalUrl);
    sendResponse({ url: finalUrl });

  } catch (error) {
    console.error('[Content] 獲取影片URL失敗:', error);
    const baseUrl = `https://www.twitch.tv${href}`;
    sendResponse({ url: `${baseUrl}/videos` });
  }
}