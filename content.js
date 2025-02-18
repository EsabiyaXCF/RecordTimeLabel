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
  const isYouTube = window.location.hostname.includes("youtube.com") || window.location.hostname.includes("youtu.be");
  if (isYouTube) {
    if (window.location.pathname.includes('/watch')) {
      const ytTitleElement = document.querySelector('yt-formatted-string.style-scope.ytd-watch-metadata');
      if (ytTitleElement) {
        const titleAttr = ytTitleElement.getAttribute('title');
        const titleText = titleAttr ? titleAttr.trim() : ytTitleElement.textContent.trim();
        return sendResponse({
          exists: true,
          title: titleText,
          elementHTML: ytTitleElement.outerHTML
        });
      }
    }
    return sendResponse({
      exists: true,
      title: document.title.replace(" - YouTube", "").trim() || "未知直播標題",
      elementHTML: ""
    });
  }
  // 原有 Twitch 邏輯
  const titleElement = document.querySelector(STREAM_TITLE_SELECTOR);
  return sendResponse({
    exists: !!titleElement,
    title: titleElement ? titleElement.textContent.trim() : '未命名直播',
    elementHTML: titleElement ? titleElement.outerHTML : ''
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
  // 檢查是否為 YouTube 影片頁面
  const isYouTube = window.location.hostname.includes("youtube.com") || window.location.hostname.includes("youtu.be");
  if (isYouTube) {
    const videoElement = document.querySelector('video');
    if (!videoElement) {
      console.error('[Content] 找不到影片元素');
      return sendResponse({ success: false, error: 'VIDEO_ELEMENT_NOT_FOUND' });
    }
    let seconds = Math.floor(videoElement.currentTime);
    // 格式化時間：若不足 1 小時則顯示 MM:SS，否則顯示 HH:MM:SS
    let formattedTime = seconds < 3600 
      ? new Date(seconds * 1000).toISOString().substr(14, 5)
      : new Date(seconds * 1000).toISOString().substr(11, 8);
    // 判斷是否為直播：透過查詢頁面是否存在 .ytp-live-badge 元素
    const isLive = !!document.querySelector('.ytp-live-badge');
    return sendResponse({
      success: true,
      time: formattedTime,
      rawElementText: videoElement.currentTime.toString(),
      timestamp: new Date().toISOString(),
      isLiveStream: isLive
    });
  }
  // 原有 Twitch 邏輯
  let timeElement = document.querySelector(LIVE_TIME_SELECTOR);
  let isLiveStream = true;
  
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
  const isYouTube = window.location.hostname.includes("youtube.com") || window.location.hostname.includes("youtu.be");
  if (isYouTube) {
    // 優先嘗試使用 <meta itemprop="videoId"> 取得影片ID
    const metaVideoId = document.querySelector('meta[itemprop="videoId"]');
    let videoId = metaVideoId && metaVideoId.getAttribute('content')
                    ? metaVideoId.getAttribute('content')
                    : (function() {
                        try {
                          const urlObj = new URL(window.location.href);
                          let id = urlObj.searchParams.get("v");
                          if (!id && urlObj.hostname === "youtu.be") {
                            id = urlObj.pathname.substring(1);
                          }
                          return id;
                        } catch (error) {
                          console.error('[Content] 解析 window.location.href 時發生錯誤:', error);
                          return null;
                        }
                      })();
    if (videoId) {
      // 只回傳純影片url，由 popup 部分再追加 ?t={秒數}
      return sendResponse({ url: `https://youtu.be/${videoId}` });
    } else {
      console.error('[Content] 無法取得影片ID');
      return sendResponse({ url: null });
    }
  }
  // Twitch 的邏輯保持原有內容
  try {
    const currentUrl = window.location.href;
    const videoMatch = currentUrl.match(/^https:\/\/www\.twitch\.tv\/videos\/(\d+)/);
    if (videoMatch) {
      console.log('[Content] 當前在影片頁面，使用當前URL');
      return sendResponse({ url: `https://www.twitch.tv/videos/${videoMatch[1]}` });
    }
    
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
    
    const username = href.replace('/', '');
    console.log('[Content] 頻道用戶名:', username);
    
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
    
    const videos = data[0]?.data?.user?.videos?.edges;
    if (!videos || videos.length === 0) {
      console.log('[Content] 找不到影片，返回影片列表頁面');
      return sendResponse({ url: `https://www.twitch.tv${href}/videos` });
    }
    
    const videoIdTwitch = videos[0].node.id;
    const finalUrl = `https://www.twitch.tv/videos/${videoIdTwitch}`;
    console.log('[Content] 生成的影片URL:', finalUrl);
    return sendResponse({ url: finalUrl });
    
  } catch (error) {
    console.error('[Content] 獲取影片URL失敗:', error);
    return sendResponse({ url: null });
  }
}