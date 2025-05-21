// 時間元素選擇器
const LIVE_TIME_SELECTOR = '.live-time > span[aria-hidden="true"]';
const VOD_TIME_SELECTOR = '.CoreText-sc-1txzju1-0.ckwzla';
const STREAM_TITLE_SELECTOR = 'p[data-a-target="stream-title"]';
const CHANNEL_NAME_SELECTOR = '.CoreText-sc-1txzju1-0.ScTitleText-sc-d9mj2s-0.AAWwv.bzDGwQ.InjectLayout-sc-1i43xsx-0.dhkijX.tw-title';
const YOUTUBE_CHANNEL_NAME_SELECTOR = 'yt-simple-endpoint.style-scope.yt-formatted-string';

// --- 新增 GQL Client ID 和 API v5 Client ID ---
// 這些 ID 可能會失效，需要定期檢查更新
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
// const V5_CLIENT_ID = ...; // 不再需要 V5 Client ID

// ---- START: New function to fetch channel display name from Twitch API ----
async function fetchChannelDisplayNameFromAPI(broadcasterId) {
  if (!broadcasterId) {
    console.error('[Content] fetchChannelDisplayNameFromAPI: broadcasterId is required.');
    return { success: false, error: 'Broadcaster ID is required.' };
  }

  const apiUrl = `https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`;
  // IMPORTANT: You need a valid Twitch OAuth Access Token (User or App Access Token) here.
  // Replace 'YOUR_TWITCH_ACCESS_TOKEN' with your actual token or a mechanism to get it.
  const YOUR_TWITCH_ACCESS_TOKEN = 'tnam9eth89mt1j5wl7c95r18wbs88g'; // Placeholder

  if (YOUR_TWITCH_ACCESS_TOKEN === 'tnam9eth89mt1j5wl7c95r18wbs88g') {
    console.warn('[Content] fetchChannelDisplayNameFromAPI: Placeholder access token is being used. API call will likely fail.');
    // You might want to fall back to selector or return an error if no real token is available.
  }

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Client-ID': GQL_CLIENT_ID,
        'Authorization': `Bearer ${YOUR_TWITCH_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[Content] Twitch API error! Status: ${response.status}, Response: ${errorData}`);
      return { success: false, error: `API error: ${response.status}`, details: errorData };
    }

    const data = await response.json();
    if (data.data && data.data.length > 0 && data.data[0].broadcaster_name) {
      return { success: true, streamerName: data.data[0].broadcaster_name };
    } else {
      console.error('[Content] Twitch API response did not contain expected data (broadcaster_name).', data);
      return { success: false, error: 'Invalid API response format.' };
    }
  } catch (error) {
    console.error('[Content] Failed to fetch channel display name from API:', error);
    return { success: false, error: error.message };
  }
}
// ---- END: New function ----

// 主消息處理器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Content] Received request object:', JSON.stringify(request)); // 詳細記錄整個 request 物件
  const action = request.action ? request.action.trim() : 'NO_ACTION_IN_REQUEST'; // Trim action and provide fallback
  console.log('[Content] Received action (trimmed):', `'${action}'`); // 記錄 trim 後的 action

  switch(action) { // 使用 trim 後的 action
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
    case "checkVodAvailability":
      (async () => {
        await handleCheckVodAvailability(sendResponse, request);
      })();
      return true;
    case "getChannelDisplayNameFromAPI": // Renamed action
      (async () => {
        // const twitchInfo = await getTwitchUsernameAndBaseUrl();
        // if (!twitchInfo || !twitchInfo.username) {
        //   sendResponse({ success: false, error: 'Could not determine Twitch username.' });
        //   return;
        // }
        
        // ---- START: TEMPORARY BYPASS FOR TESTING ----
        // Comment out the actual getTwitchUserInfo call
        // const userInfo = await getTwitchUserInfo(twitchInfo.username);
        
        // Manually provide a known broadcaster_id for testing
        const userInfo = { id: '141981764', login: 'twitchdev' }; // Example: TwitchDev
        console.log('[Content] USING HARDCODED userInfo for testing:', userInfo);
        // ---- END: TEMPORARY BYPASS FOR TESTING ----

        if (!userInfo || !userInfo.id) {
          sendResponse({ success: false, error: 'Could not get broadcaster ID from username (or hardcoded ID is missing).' });
          return;
        }

        let apiResponse = await fetchChannelDisplayNameFromAPI(userInfo.id);
        
        if (!apiResponse.success) {
          console.warn('[Content] API call for channel name failed. Attempting DOM fallback using CHANNEL_NAME_SELECTOR.');
          try {
            const element = document.querySelector(CHANNEL_NAME_SELECTOR);
            if (element && element.textContent) {
              console.log('[Content] DOM fallback successful. Found name:', element.textContent.trim());
              sendResponse({ success: true, streamerName: element.textContent.trim(), source: 'dom_fallback' });
            } else {
              console.error('[Content] DOM fallback failed: Element not found or has no text content using CHANNEL_NAME_SELECTOR.');
              // Send the original API error if DOM fallback also fails
              sendResponse({ ...apiResponse, error: `API failed (${apiResponse.error || 'Unknown API error'}) and DOM fallback also failed.` , source: 'api_and_dom_failed'});
            }
          } catch (domError) {
            console.error('[Content] DOM fallback error during getChannelDisplayNameFromAPI:', domError);
            // Send the original API error if DOM fallback also errors
            sendResponse({ ...apiResponse, error: `API failed (${apiResponse.error || 'Unknown API error'}) and DOM fallback errored: ${domError.message}`, source: 'api_and_dom_failed_exception' });
          }
        } else {
          // API call was successful
          sendResponse({ ...apiResponse, source: 'api' });
        }
      })();
      return true;
    case "getYouTubeChannelName": // New action for YouTube channel name
      handleGetYouTubeChannelName(sendResponse);
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

// 使用 GQL 獲取 Twitch User Info (包括數字 ID)
async function getTwitchUserInfo(username) {
    if (!username) return null;
    console.log('[Content] getTwitchUserInfo called for:', username, '(NOTE: This call is currently bypassed in getChannelDisplayNameFromAPI)');
    // Temporarily return a dummy value or null to prevent actual GQL call during this specific test phase
    // if we were not bypassing it above.
    // return null; 
    const gqlEndpoint = 'https://gql.twitch.tv/gql';
    const query = {
        operationName: 'UserInfo', // 這個 Operation Name 可能需要確認
        variables: { login: username },
        extensions: {
            persistedQuery: {
                version: 1,
                // 這個 Hash 需要找到對應獲取 User Info 的 GQL 請求
                // 暫時使用一個常見的查詢 Hash (可能不對，需要替換)
                // 例如：'f3a12d9f406d83c6137d70779bb6794011a9f5b4a4308ad63dac5e924c089116' (用於 User Avatars/Display Names)
                // 更好的方法是監聽 Twitch 網頁發出的 GQL 請求找到正確的 Hash
                sha256Hash: '08ecdaf444933114764a8007119a1cf6154e7a9036e4a531746c530654279075' // Hash for resolving user ID from login
            }
        }
    };

    try {
        const response = await fetch(gqlEndpoint, {
            method: 'POST',
            headers: { 'Client-ID': GQL_CLIENT_ID, 'Content-Type': 'application/json' },
            body: JSON.stringify(query)
        });
        if (!response.ok) throw new Error(`GQL UserInfo HTTP error! status: ${response.status}`);
        const data = await response.json();
        const userId = data?.data?.user?.id;
        console.log(`[Content] GQL UserInfo for ${username}: ID = ${userId}`);
        return userId ? { id: userId, login: username } : null;
    } catch (error) {
        console.error(`[Content] Failed to get Twitch User Info for ${username}:`, error);
        return null;
    }
}

// 使用 GQL 獲取當前直播資訊 (包括 Stream ID)
async function getCurrentLiveStreamInfo(username) {
    if (!username) return null;
    // console.log('[Content] getCurrentLiveStreamInfo called. Temporarily returning null to avoid GQL call.');
    // return null; // Temporarily disable GQL call

    const gqlEndpoint = 'https://gql.twitch.tv/gql';
    const query = {
        operationName: 'StreamMetadata', // 這個 Operation Name 可能需要確認
        variables: { channelLogin: username },
        extensions: {
            persistedQuery: {
                version: 1,
                // Hash for StreamMetadata query (需要確認或找到)
                // Example Hash (may be incorrect):
                sha256Hash: '1c719a40f481453e4e4f596991f99c802c783bbf9d2ac12b5cfa0703b0b2721b'
            }
        }
    };
     try {
        const response = await fetch(gqlEndpoint, {
            method: 'POST',
            headers: { 'Client-ID': GQL_CLIENT_ID, 'Content-Type': 'application/json' },
            body: JSON.stringify(query)
        });
        if (!response.ok) throw new Error(`GQL StreamMetadata HTTP error! status: ${response.status}`);
        const data = await response.json();
        const stream = data?.data?.user?.stream;
        if (stream && stream.type === 'live') { // 確保是 LIVE stream
            console.log(`[Content] GQL StreamMetadata for ${username}: Stream ID = ${stream.id}, CreatedAt: ${stream.createdAt}`);
            return { id: stream.id, createdAt: stream.createdAt }; // 返回 Stream ID 和創建時間
        }
        console.log(`[Content] GQL StreamMetadata for ${username}: Not live or stream info not found.`);
        return null; // 不是直播或找不到 Stream
    } catch (error) {
        console.error(`[Content] Failed to get Twitch Live Stream Info for ${username}:`, error);
        return null;
    }
}

// 提取獲取 YouTube URL 的核心邏輯
function getYouTubeVideoUrl() {
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
    return `https://youtu.be/${videoId}`;
  }
  console.error('[Content] 無法取得 YouTube 影片 ID');
  return null;
}

// 提取獲取 Twitch URL 的核心邏輯 (包括 VOD 檢查)
async function getTwitchUrlData() {
    const currentUrl = window.location.href;
    // 情況 1：如果已經在 VOD 頁面
    const videoMatch = currentUrl.match(/^https:\/\/www\.twitch\.tv\/videos\/(\\d+)/);
    if (videoMatch) {
        console.log('[Content] 當前在 Twitch VOD 頁面');
        return { hasVod: true, url: `https://www.twitch.tv/videos/${videoMatch[1]}` };
    }

    // 情況 2：在直播頻道頁面，嘗試查詢最新 VOD
    // 注意：Twitch 頁面結構可能改變，此選擇器需要保持更新
    const channelLink = document.querySelector('a[data-a-target="user-channel-header-channel-link"], .channel-info-content a[data-a-target="CoreTextLink"]');
    let username = null;
    let channelBaseUrl = null;

    if (channelLink && channelLink.getAttribute('href')) {
        const href = channelLink.getAttribute('href');
        if (href && href !== '/') { // 忽略無效或指向根目錄的連結
           username = href.startsWith('/') ? href.substring(1) : href;
           console.log('[Content] 從頁面元素找到 Twitch 頻道用戶名:', username);
           channelBaseUrl = `https://www.twitch.tv${href.startsWith('/') ? href : '/' + href}`;
        } else {
            console.warn('[Content] 找到的頻道連結無效:', href);
        }
    }

    // 如果從元素找不到，嘗試從 URL 推斷頻道名稱 (適用於頻道主頁面)
    if (!username) {
      const pathMatch = window.location.pathname.match(/^\/([a-zA-Z0-9_]+)(\/|$)/);
      if (pathMatch && pathMatch[1]) {
          const potentialUsername = pathMatch[1];
          // 避免將 'videos', 'clips', 'followers', 'following', 'schedule', 'about' 等路徑誤判為用戶名
          if (!['videos', 'clips', 'followers', 'following', 'schedule', 'about'].includes(potentialUsername.toLowerCase())) {
            username = potentialUsername;
            console.log('[Content] 從路徑推斷頻道用戶名:', username);
            channelBaseUrl = `https://www.twitch.tv/${username}`;
          }
      }
    }

    if (!username || !channelBaseUrl) {
       console.error('[Content] 無法確定 Twitch 頻道');
       return { hasVod: false, url: currentUrl }; // 回傳當前 URL 作為備用
    }

    // 確定有 username 和 channelBaseUrl 後，才進行 GQL 查詢
    return await fetchLatestTwitchVod(username, channelBaseUrl);
}

// 輔助函數：使用 GQL 查詢最新的 Twitch VOD
async function fetchLatestTwitchVod(username, channelBaseUrl) {
    // console.log('[Content] fetchLatestTwitchVod called. Temporarily returning non-VOD to avoid GQL call.');
    // return { hasVod: false, url: `${channelBaseUrl}/videos`, publishedAt: null }; // Temporarily disable GQL call

    const gqlEndpoint = 'https://gql.twitch.tv/gql';
    const clientId = GQL_CLIENT_ID; // 使用之前定義的 GQL Client ID
    const sha256Hash = 'a937f1d22e269e39a03b509f65a7490f9fc247d7f83d6ac1421523e3b68042cb'; // FilterableVideoTower_Videos Hash

    const query = [{
        operationName: 'FilterableVideoTower_Videos',
        variables: {
            limit: 1, // 只需獲取最新的 VOD
            channelOwnerLogin: username,
            broadcastType: 'ARCHIVE',
            videoSort: 'TIME'
        },
        extensions: {
            persistedQuery: { version: 1, sha256Hash: sha256Hash }
        }
    }];

    try {
        console.log(`[Content] GQL Latest VOD: Fetching for ${username}`);
        const response = await fetch(gqlEndpoint, {
            method: 'POST',
            headers: { 'Client-ID': clientId, 'Content-Type': 'application/json' },
            body: JSON.stringify(query)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Content] GQL Latest VOD HTTP error! Status: ${response.status}, Response: ${errorText}`);
            throw new Error(`GQL Latest VOD HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        // console.log('[Content] GQL Latest VOD Raw Response:', JSON.stringify(data, null, 2)); // 可用於調試

        const videos = data?.[0]?.data?.user?.videos?.edges;
        if (videos && videos.length > 0 && videos[0]?.node?.id) {
            const latestVod = videos[0].node;
            const vodUrl = `https://www.twitch.tv/videos/${latestVod.id}`;
            const publishedAt = latestVod.publishedAt; // **獲取 publishedAt**

            console.log(`[Content] GQL Latest VOD: Found VOD ${latestVod.id}, URL: ${vodUrl}, Published: ${publishedAt}`);
            return {
                hasVod: true,
                url: vodUrl,
                id: latestVod.id,
                publishedAt: publishedAt // **回傳 publishedAt**
             };
        } else {
            console.log(`[Content] GQL Latest VOD: No valid VOD found for ${username}.`);
            // 找不到 VOD 時，URL 回退到頻道影片列表
            return { hasVod: false, url: `${channelBaseUrl}/videos`, publishedAt: null };
        }
    } catch (error) {
        console.error(`[Content] GQL Latest VOD: Query failed for ${username}:`, error);
        // 查詢失敗也視為無 VOD
        return { hasVod: false, url: `${channelBaseUrl}/videos`, publishedAt: null };
    }
}

// 修改後的 handleGetChannelUrl
async function handleGetChannelUrl(sendResponse) {
  const isYouTube = window.location.hostname.includes("youtube.com") || window.location.hostname.includes("youtu.be");
  if (isYouTube) {
    const url = getYouTubeVideoUrl();
    sendResponse({ url: url });
  } else {
    // 對於 Twitch，先嘗試獲取 VOD 或頻道頁面 URL
    try {
        // 檢查是否直接在 VOD 頁面
        const currentUrl = window.location.href;
        const videoMatch = currentUrl.match(/^https:\/\/www\.twitch\.tv\/videos\/(\d+)/);
        if (videoMatch) {
            sendResponse({ url: currentUrl }); // 是 VOD 頁面，直接用
            return;
        }
        // 否則，嘗試獲取頻道資訊並查最新 VOD
        const twitchInfo = await getTwitchUsernameAndBaseUrl();
        if (twitchInfo) {
            const latestVodData = await fetchLatestTwitchVod(twitchInfo.username, twitchInfo.channelBaseUrl);
            sendResponse({ url: latestVodData.url }); // 回傳最新找到的 URL (可能是 VOD 或頻道影片頁)
        } else {
            sendResponse({ url: currentUrl }); // 無法獲取頻道資訊，回傳當前 URL
        }
    } catch (error) {
        console.error('[Content] 處理 handleGetChannelUrl 中的 Twitch 邏輯時發生錯誤:', error);
        sendResponse({ url: window.location.href }); // 發生錯誤時回傳當前 URL
    }
  }
}

// --- **第二步：重寫 handleCheckVodAvailability (基於 GQL 和時間判斷)** ---
async function handleCheckVodAvailability(sendResponse, request) {
  const isYouTube = window.location.hostname.includes("youtube.com") || window.location.hostname.includes("youtu.be");

  if (isYouTube) {
    const youtubeUrl = getYouTubeVideoUrl();
    sendResponse({ hasVod: !!youtubeUrl, url: youtubeUrl });
    return;
  }

  // --- Twitch 邏輯 ---
  const recordTimestamp = request?.recordTimestamp;
  const originalStreamUrl = request?.originalStreamUrl;

  // 1. 檢查 originalStreamUrl 是否直接就是一個 VOD 頁面
  if (originalStreamUrl && originalStreamUrl.includes('twitch.tv/videos/')) {
    const vodPageMatchFromOriginal = originalStreamUrl.match(/^https:\/\/www\.twitch\.tv\/videos\/(\d+)/);
    if (vodPageMatchFromOriginal) {
        console.log('[Content] VOD Check: originalStreamUrl is a VOD page. Reporting VOD exists.', originalStreamUrl);
        sendResponse({ hasVod: true, url: originalStreamUrl });
        return;
    }
  }

  // 2. 如果 originalStreamUrl 不是 VOD 頁面，則嘗試從它獲取頻道資訊
  //    如果 originalStreamUrl 無效或無法從中提取頻道，則 getTwitchUsernameAndBaseUrl 會返回 null
  const twitchInfo = originalStreamUrl 
    ? await getTwitchUsernameAndBaseUrl(originalStreamUrl)
    : await getTwitchUsernameAndBaseUrl(); // Fallback if no originalStreamUrl (should not happen for recheck)

  if (!twitchInfo) {
    console.log('[Content] VOD Check: Could not determine channel info from originalStreamUrl or current page.', originalStreamUrl);
    // 如果連 twitchInfo 都無法獲取，則無法繼續檢查，回傳 hasVod: false 和原始的 URL（如果有的話）或當前 URL
    sendResponse({ hasVod: false, url: originalStreamUrl || window.location.href });
    return;
  }
  const { username, channelBaseUrl } = twitchInfo;

  // 3. 獲取當前直播狀態 (基於解析出的 username)
  const liveStreamInfo = await getCurrentLiveStreamInfo(username);
  const isCurrentlyLive = !!liveStreamInfo; // 檢查是否有直播資訊

  // 4. 獲取最新的 VOD 資訊 (包括 publishedAt)
  const latestVodData = await fetchLatestTwitchVod(username, channelBaseUrl);

  // 5. 判斷邏輯
  let finalHasVod = false;
  let finalUrl = latestVodData.url; // 預設使用 GQL 找到的 URL (可能是 VOD 或 /videos)

  if (isCurrentlyLive) {
    // **情況 A: 正在直播**
    console.log('[Content] VOD Check: Stream is currently live. Reporting no VOD available yet.');
    finalHasVod = false;
    finalUrl = `${channelBaseUrl}/videos`; // 指向影片列表頁
  } else {
    // **情況 B: 不在直播**
    console.log('[Content] VOD Check: Stream is not live. Comparing latest VOD publish time with record click time.');
    // **修改：使用 recordTimestamp 進行比較**
    if (latestVodData.hasVod && latestVodData.publishedAt && recordTimestamp) {
        // 必須同時有 VOD 發布時間和記錄點擊時間才能比較
        try {
            const vodPublishDate = new Date(latestVodData.publishedAt);
            const clickTimestampDate = new Date(recordTimestamp);
            const timeDiffMillis = vodPublishDate - clickTimestampDate; // VOD 發布時間 - 記錄點擊時間

            // **設定新的時間差閾值**
            // VOD 應在點擊後發布 (允許一點誤差，例如 -12 小時)
            const minMillisDifference = -12 * 60 * 60 * 1000;
            // VOD 發布時間不應晚於點擊時間太多 (例如 24 小時)
            const maxHoursDifference = 24;
            const maxMillisDifference = maxHoursDifference * 60 * 60 * 1000;

            console.log(`[Content] VOD Check: Record Click=${clickTimestampDate}, VOD Publish=${vodPublishDate}, Diff=${(timeDiffMillis / (1000 * 60 * 60)).toFixed(1)}h`);

            if (timeDiffMillis >= minMillisDifference && timeDiffMillis <= maxMillisDifference) {
                // 時間差在合理範圍內，認為是本次記錄對應的 VOD
                console.log(`[Content] VOD Check: Time difference is within range [${minMillisDifference / (1000*60*60)}h, ${maxHoursDifference}h]. Reporting VOD exists.`);
                finalHasVod = true;
                finalUrl = latestVodData.url; // 確認使用 VOD URL
            } else {
                // 時間差太大或 VOD 發布時間遠早於點擊時間
                console.log(`[Content] VOD Check: Time difference is outside the acceptable range. Reporting no VOD exists.`);
                finalHasVod = false;
                finalUrl = `${channelBaseUrl}/videos`; // 指向影片列表頁
            }
        } catch (dateError) {
            console.error('[Content] VOD Check: Error parsing VOD/Record dates:', dateError);
            finalHasVod = false; // 解析日期出錯，保守回報 false
            finalUrl = `${channelBaseUrl}/videos`;
        }
    } else {
        // 缺少必要的資訊來進行比較
        console.log('[Content] VOD Check: Missing VOD publish time or Record click time for comparison. Reporting no VOD exists.');
        finalHasVod = false;
        finalUrl = `${channelBaseUrl}/videos`; // 指向影片列表頁
    }
  }

  console.log(`[Content] VOD Check Final Result: hasVod=${finalHasVod}, url=${finalUrl}`);
  sendResponse({ hasVod: finalHasVod, url: finalUrl });
}

// 這個函數現在主要負責獲取 username 和 channelBaseUrl
// 新增 sourceUrl 參數，用於指定解析的源 URL
async function getTwitchUsernameAndBaseUrl(sourceUrl) {
    const urlToParse = sourceUrl || window.location.href;
    let parsedUrl;
    try {
        parsedUrl = new URL(urlToParse);
    } catch (e) {
        console.error(`[Content] Invalid URL provided to getTwitchUsernameAndBaseUrl: ${urlToParse}`, e);
        return null;
    }

    // (重用 getTwitchUrlData 中獲取 username 和 channelBaseUrl 的邏輯，但基於 parsedUrl)
     // 注意：Twitch 頁面結構可能改變，此選擇器需要保持更新
    const channelSelectors = [
        'a[data-a-target="user-channel-header-channel-link"]', // 舊版?
        '.channel-info-content a[data-a-target="CoreTextLink"]', // 較新版?
        'a[data-test-selector="stream-info-card-component__stream-avatar-link"]', // 播放器下方的頭像連結
        'a.tw-link[data-test-selector="channel-info__channel-name-link"]' // 新的頻道資訊連結？
    ];
    let channelLinkElement = null;
    for (const selector of channelSelectors) {
        channelLinkElement = document.querySelector(selector);
        if (channelLinkElement) break;
    }

    let username = null;
    let channelBaseUrl = null;

    if (channelLinkElement && channelLinkElement.getAttribute('href')) {
        const href = channelLinkElement.getAttribute('href');
        // Twitch連結通常是相對路徑 /channelname
        if (href && href.startsWith('/') && href.length > 1) {
           username = href.substring(1).split('/')[0]; // 取路徑的第一部分作為用戶名
           console.log('[Content] 從頁面元素找到 Twitch 頻道用戶名:', username);
           channelBaseUrl = `https://www.twitch.tv/${username}`;
        } else {
            console.warn('[Content] 找到的頻道連結格式不符或無效:', href);
        }
    }

    // 如果從元素找不到，嘗試從 URL 推斷頻道名稱
    if (!username) {
      // 匹配 /channelname 或 /channelname/ 或 /channelname/videos 等
      const pathMatch = parsedUrl.pathname.match(/^\/([a-zA-Z0-9_]+)(\/|$)/);
      if (pathMatch && pathMatch[1]) {
          const potentialUsername = pathMatch[1];
          // 避免將 'videos', 'clips', 'followers', 'following', 'schedule', 'about', 'profile' 等常見路徑誤判為用戶名
          if (!['videos', 'clips', 'followers', 'following', 'schedule', 'about', 'profile'].includes(potentialUsername.toLowerCase())) {
            username = potentialUsername;
            console.log('[Content] 從路徑推斷頻道用戶名:', username);
            channelBaseUrl = `https://www.twitch.tv/${username}`;
          } else {
            console.log(`[Content] 路徑 '${potentialUsername}' 被識別為非用戶名路徑`);
          }
      }
    }

    // 最後檢查是否成功獲取 username 和 channelBaseUrl
    if (!username || !channelBaseUrl) {
       console.error('[Content] 無法確定 Twitch 頻道 Username/BaseURL');
       return null;
    }
    console.log(`[Content] Determined Username: ${username}, BaseURL: ${channelBaseUrl}`);
    return { username, channelBaseUrl };
}

// New function to handle YouTube channel name extraction
function handleGetYouTubeChannelName(sendResponse) {
  const isYouTube = window.location.hostname.includes("youtube.com") || window.location.hostname.includes("youtu.be");
  if (isYouTube) {
    // Specifically target the channel name link within the video description or channel page
    // The user provided: 'yt-simple-endpoint.style-scope.yt-formatted-string'
    // This selector can be broad. We might need to refine it or look for a more specific parent.
    // For a video page, the uploader's channel name is often in a specific section.
    // Let's try the provided selector first, focusing on links that are likely channel names.
    // Common location: <ytd-video-owner-renderer> <yt-formatted-string class="ytd-channel-name"> <a class="yt-simple-endpoint style-scope yt-formatted-string">
    // Or on channel pages: <yt-formatted-string id="text" class="style-scope ytd-channel-name">
    // The provided selector might be too general.
    // Let's try to find the element within #owner #channel-name a or #meta #channel-name a for video pages
    // or #inner-header-container #text.ytd-channel-name for channel pages.

    let channelNameElement = null;
    let channelName = null;

    // Attempt 1: More specific selector for video page uploader
    channelNameElement = document.querySelector('#owner #channel-name a.yt-simple-endpoint.style-scope.yt-formatted-string, ytd-video-owner-renderer yt-formatted-string.ytd-channel-name a.yt-simple-endpoint');
    if (channelNameElement && channelNameElement.textContent) {
        channelName = channelNameElement.textContent.trim();
    }

    // Attempt 2: User's provided selector if the first one fails, but be cautious as it might be too broad.
    // We need to ensure it's actually a channel link.
    if (!channelName) {
        const elements = document.querySelectorAll(YOUTUBE_CHANNEL_NAME_SELECTOR);
        for (let el of elements) {
            // Try to find an element that is a link and likely a channel name
            // Channel names are usually within an <a> tag and might have a href attribute like /@channelname or /channel/channelid
            if (el.tagName === 'A' && el.href && (el.href.includes('/@') || el.href.includes('/channel/') || el.href.includes('/user/'))) {
                if (el.textContent && el.textContent.trim().length > 0) {
                    channelName = el.textContent.trim();
                    channelNameElement = el;
                    break;
                }
            }
        }
    }
    
    // Attempt 3: Selector for channel page name (if on a channel page)
    if(!channelName) {
        channelNameElement = document.querySelector('#inner-header-container #text.ytd-channel-name');
         if (channelNameElement && channelNameElement.textContent) {
            channelName = channelNameElement.textContent.trim();
        }
    }


    if (channelName) {
      sendResponse({ success: true, streamerName: channelName, selectorUsed: channelNameElement.outerHTML });
    } else {
      // Fallback if no specific element found, could try document.title or another generic approach if needed,
      // but for now, report not found.
      console.warn('[Content] YouTube channel name element not found with selectors or is empty.');
      sendResponse({ success: false, error: 'YOUTUBE_CHANNEL_NAME_NOT_FOUND' });
    }
  } else {
    sendResponse({ success: false, error: 'NOT_YOUTUBE_PAGE' });
  }
}