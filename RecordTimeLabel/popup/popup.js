const UI = {
  titleInput: document.getElementById('titleInput'),
  recordBtn: document.getElementById('recordBtn'),
  statusEl: document.getElementById('status'),
  recordsList: document.getElementById('recordsList'),
  foldersList: document.getElementById('foldersList'),
  addFolderBtn: document.getElementById('addFolderBtn'),
  importBtn: document.getElementById('importBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput')
};

let folders = [];
let records = [];
let currentTab = null;
let isRecording = false;
let currentFolder = null;
let dragState = {
  type: null,
  id: null,
  startIndex: -1,
  currentList: null
};

document.addEventListener('DOMContentLoaded', initPopup);

async function initPopup() {
  try {
    if (window.hasPopupInitialized) return;
    window.hasPopupInitialized = true;

    [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!isValidTwitchPage(currentTab.url)) {
      showErrorMessage('請在 Twitch 或 YouTube 影片頁面使用本功能');
      UI.recordBtn.disabled = true;
      return;
    }

    // 根據目前的頁面 URL 更新主題色系
    updateTheme();

    setupEventListeners();
    await loadAllData();

  } catch (error) {
    handleCriticalError('初始化失敗', error);
  }
}

async function loadAllData() {
  const [foldersData, recordsData] = await Promise.all([
    chrome.storage.local.get('folders'),
    chrome.storage.local.get('timeRecords')
  ]);
  
  folders = foldersData.folders || [];
  records = migrateRecords(recordsData.timeRecords || []);
  
  renderFolders();
  renderRecords();
}

function migrateRecords(oldRecords) {
  return oldRecords.map(record => ({
    ...record,
    folderId: record.folderId || null,
    title: record.title || '無標題直播',
    topic: record.topic || '無主題',
    id: record.id || Date.now().toString()
  }));
}

function setupEventListeners() {
  UI.recordBtn.addEventListener('click', handleRecordClick);
  UI.titleInput.addEventListener('keypress', handleKeyPress);
  UI.addFolderBtn.addEventListener('click', handleCreateFolder);
  UI.foldersList.addEventListener('click', handleFolderClick);
  
  // 資料夾拖曳相關
  UI.foldersList.addEventListener('dragstart', handleFolderDragStart);
  UI.foldersList.addEventListener('dragend', handleFolderDragEnd);
  UI.foldersList.addEventListener('dragover', handleFolderDragOver);
  UI.foldersList.addEventListener('drop', handleFolderDrop);

  // 記錄拖曳相關
  UI.recordsList.addEventListener('dragstart', handleDragStart);
  UI.recordsList.addEventListener('dragend', handleDragEnd);
  UI.recordsList.addEventListener('dragover', handleRecordDragOver);
  UI.recordsList.addEventListener('drop', handleRecordDrop);

  UI.recordsList.addEventListener('click', handleDeleteClick);
  UI.recordsList.addEventListener('click', handleCopyClick);

  // 新增：點擊紀錄中的影片播放時間時，直接在同一個 YouTube/Twitch 影片頁面跳轉到該時間點（不重新載入網頁）
  document.addEventListener('click', function(event) {
    const playbackEl = event.target.closest('.record-playback-time');
    if (playbackEl) {
      event.preventDefault();
      // 如果是在 YouTube 或 Twitch 影片頁面，直接注入腳本使影片跳到指定時間
      if (currentTab.url.includes("youtube.com/watch") ||
          currentTab.url.includes("youtu.be") ||
          currentTab.url.includes("twitch.tv/videos/")) {
        // 從播放時間文字中取得目標時間，例如 "04:24" 或 "1:30:20"
        const timeString = playbackEl.innerText.trim();
        const seconds = convertTimeToSeconds(timeString);
        if (typeof seconds === 'number') {
          chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: async (sec) => {
              // 嘗試取得影片元素，若找不到等待 500ms 再試一次
              let video = document.querySelector('video');
              if (!video) {
                await new Promise(resolve => setTimeout(resolve, 500));
                video = document.querySelector('video');
              }
              if (video) {
                video.currentTime = sec;
                // 若需要自動播放，也可以呼叫 video.play();
              } else {
                console.error('找不到影片元素');
              }
            },
            args: [seconds],
          });
          window.close();
        }
      } else {
        // 非 YouTube/Twitch 影片頁面，依舊以原有方式進行跳轉
        const jumpUrl = playbackEl.getAttribute('data-jump-url');
        if (jumpUrl) {
          window.open(jumpUrl, "_blank");
        }
      }
    }
  });

  // 匯出按鈕點擊事件
  UI.exportBtn.addEventListener('click', handleExport);
  
  // 匯入按鈕點擊事件
  UI.importBtn.addEventListener('click', () => UI.importInput.click());
  
  // 檔案選擇事件
  UI.importInput.addEventListener('change', handleImport);
}

// 資料夾拖曳相關函數
function handleFolderDragStart(e) {
  const folderItem = e.target.closest('.folder-item');
  if (!folderItem || folderItem.classList.contains('uncategorized')) {
    e.preventDefault();
    return;
  }
  
  folderItem.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  dragState = {
    type: 'folder',
    id: folderItem.dataset.id
  };
}

function handleFolderDragEnd(e) {
  e.target.closest('.folder-item')?.classList.remove('dragging');
  dragState = null;
}

async function handleCopyClick(e) {
  const copyBtn = e.target.closest('.copy-btn');
  if (!copyBtn) return;

  const recordItem = copyBtn.closest('.record-item');
  // 取得先前儲存的跳轉 URL，此 URL 由影片連結與時間參數組成 (例如 "?t=264s")
  const jumpUrl = recordItem.getAttribute('data-jump-url');
  if (jumpUrl) {
    if (currentTab.url.includes("youtube.com/watch") ||
        currentTab.url.includes("youtu.be") ||
        currentTab.url.includes("twitch.tv/videos/")) {
      // 如果已在目標影片頁面，直接以跳轉 URL 更新本分頁
      chrome.tabs.update(currentTab.id, { url: jumpUrl });
      window.close();
    } else {
      // 非影片頁面則新增分頁開啟該 URL
      window.open(jumpUrl, '_blank');
    }
  }
}

function handleFolderClick(e) {
  const deleteBtn = e.target.closest('.folder-delete-btn');
  if (deleteBtn) {
    handleFolderDelete(deleteBtn);
    return;
  }

  // 如果點擊的是編輯容器或其子元素，不處理選擇事件
  if (e.target.closest('.edit-container')) {
    return;
  }

  const folderItem = e.target.closest('.folder-item');
  if (folderItem) {
    currentFolder = folderItem.dataset.id === 'uncategorized' ? null : folderItem.dataset.id;
    renderFolders();
    renderRecords();
  }
}

async function handleFolderDelete(deleteBtn) {
  const folderItem = deleteBtn.closest('.folder-item');
  const folderId = folderItem.dataset.id;
  
  if (!confirm('確定要永久刪除「' + getFolderName(folderId) + '」？\n此操作會將所有記錄移至未分類！')) return;

  try {
    folders = folders.filter(f => f.id !== folderId);
    records = records.map(record => 
      record.folderId === folderId ? { ...record, folderId: null } : record
    );

    if (currentFolder === folderId) currentFolder = null;

    await Promise.all([
      chrome.storage.local.set({ folders }),
      chrome.storage.local.set({ timeRecords: records })
    ]);

    renderFolders();
    renderRecords();
    showTempStatus('✓ 資料夾已刪除');
  } catch (error) {
    handleRuntimeError('刪除失敗', error);
    showTempStatus('✕ 刪除失敗');
  }
}

function renderFolders() {
  UI.foldersList.innerHTML = `
    <div class="folder-item uncategorized ${!currentFolder ? 'selected' : ''}" 
         data-id="uncategorized"
         draggable="false">
      <div>📁 未分類</div>
      <div class="folder-count">
        ${records.filter(r => !r.folderId).length}
      </div>
    </div>
    ${folders.map(folder => `
      <div class="folder-item ${currentFolder === folder.id ? 'selected' : ''}" 
           data-id="${folder.id}"
           draggable="true">
        <button class="folder-delete-btn" aria-label="刪除資料夾">×</button>
        <div class="folder-name" data-id="${folder.id}">📁 ${folder.name}</div>
        <div class="folder-count">
          ${records.filter(r => r.folderId === folder.id).length}
        </div>
      </div>
    `).join('')}
  `;

  // 綁定拖曳相關事件
  const folderItems = document.querySelectorAll('.folder-item:not(.uncategorized)');
  folderItems.forEach(item => {
    item.addEventListener('dragstart', handleFolderDragStart);
    item.addEventListener('dragend', handleFolderDragEnd);
    item.addEventListener('dragover', handleFolderDragOver);
    item.addEventListener('drop', handleFolderDrop);
  });

  // 綁定資料夾名稱的雙擊事件
  document.querySelectorAll('.folder-name').forEach(nameElement => {
    if (nameElement.closest('.folder-item').dataset.id !== 'uncategorized') {
      nameElement.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      let clickTimeout;
      let clickCount = 0;
      
      nameElement.addEventListener('mousedown', (e) => {
        clickCount++;
        if (clickCount === 1) {
          clickTimeout = setTimeout(() => {
            clickCount = 0;
            // 單擊事件：選擇資料夾
            const folderItem = nameElement.closest('.folder-item');
            if (folderItem) {
              currentFolder = folderItem.dataset.id === 'uncategorized' ? null : folderItem.dataset.id;
              renderFolders();
              renderRecords();
            }
          }, 200);
        } else if (clickCount === 2) {
          clearTimeout(clickTimeout);
          clickCount = 0;
          // 雙擊事件：編輯資料夾名稱
          handleFolderNameDoubleClick(e, nameElement.dataset.id);
        }
      });
    }
  });

  // 綁定其他點擊事件（刪除按鈕和資料夾項目的點擊）
  UI.foldersList.addEventListener('click', handleFolderClick);
}

function handleFolderDragOver(e) {
  e.preventDefault();
  const folderItem = e.target.closest('.folder-item');
  if (!folderItem) return;

  // 如果是記錄或群組被拖曳到資料夾，則只呈現 hover 效果
  if (dragState?.type === 'record' || dragState?.type === 'group') {
    if (!folderItem.classList.contains('dragging')) {
      document.querySelectorAll('.folder-item').forEach(item => {
        item.classList.remove('dragover');
      });
      folderItem.classList.add('dragover');
    }
    return;
  }

  // 以下為原有資料夾排序邏輯（僅用於拖曳資料夾本身）
  if (!folderItem || folderItem.classList.contains('uncategorized')) return;
  const draggingItem = document.querySelector('.folder-item.dragging');
  if (!draggingItem || draggingItem === folderItem) return;

  const foldersList = document.getElementById('foldersList');
  const folderItems = [...foldersList.querySelectorAll('.folder-item:not(.uncategorized)')];

  const draggingIndex = folderItems.indexOf(draggingItem);
  const targetIndex = folderItems.indexOf(folderItem);

  const rect = folderItem.getBoundingClientRect();
  const mouseY = e.clientY;
  const threshold = rect.top + (rect.height / 2);

  draggingItem.parentNode.removeChild(draggingItem);

  if (mouseY < threshold) {
    folderItem.parentNode.insertBefore(draggingItem, folderItem);
  } else {
    folderItem.parentNode.insertBefore(draggingItem, folderItem.nextSibling);
  }

  e.dataTransfer.dropEffect = 'move';
}

async function handleFolderDrop(e) {
  e.preventDefault();
  const folderItem = e.target.closest('.folder-item');
  if (!folderItem) return;

  // 處理記錄拖曳到資料夾的情況
  if (dragState?.type === 'record') {
    const recordId = dragState.id;
    const targetFolderId = folderItem.dataset.id === 'uncategorized' ? null : folderItem.dataset.id;
    
    // 更新記錄的資料夾
    const record = records.find(r => r.id === recordId);
    if (record) {
      record.folderId = targetFolderId;
      await chrome.storage.local.set({ timeRecords: records });
      renderFolders();
      renderRecords();
      showTempStatus('✓ 已移動記錄');
    }
    
    // 清除拖曳效果
    document.querySelectorAll('.folder-item').forEach(item => {
      item.classList.remove('dragover');
    });
    return;
  }
  
  //【新增】處理群組拖曳到資料夾的情況
  if (dragState?.type === 'group') {
    const targetFolderId = folderItem.dataset.id === 'uncategorized' ? null : folderItem.dataset.id;
    // 使用拖曳時記錄的直播標題，更新所有該群組的記錄，將其 folderId 設定為目標資料夾
    records = records.map(r => {
      if (r.title === dragState.title) {
        return { ...r, folderId: targetFolderId };
      }
      return r;
    });
    await chrome.storage.local.set({ timeRecords: records });
    renderFolders();
    renderRecords();
    showTempStatus('✓ 已移動群組到資料夾');

    // 清除拖曳效果
    document.querySelectorAll('.folder-item').forEach(item => {
      item.classList.remove('dragover');
    });
    dragState = null;
    return;
  }

  // 原有的資料夾排序邏輯（僅用於拖曳資料夾本身）
  if (!dragState || dragState.type !== 'folder') return;
  const foldersList = document.getElementById('foldersList');
  const folderItems = [...foldersList.querySelectorAll('.folder-item:not(.uncategorized)')];

  const newFolders = folderItems.map(item => {
    const folderId = item.dataset.id;
    return folders.find(f => f.id === folderId);
  }).filter(Boolean);
  
  folders = newFolders;
  await chrome.storage.local.set({ folders });
  renderFolders();
  showTempStatus('✓ 已更新資料夾順序');
}

function formatTimeForUrl(timeString) {
  // 移除可能存在的空格
  timeString = timeString.trim();
  
  // 分割時間字串
  const parts = timeString.split(':');
  let hours = 0, minutes = 0, seconds = 0;
  
  if (parts.length === 3) {
    // 格式為 HH:MM:SS
    hours = parseInt(parts[0]);
    minutes = parseInt(parts[1]);
    seconds = parseInt(parts[2]);
  } else if (parts.length === 2) {
    // 格式為 MM:SS
    minutes = parseInt(parts[0]);
    seconds = parseInt(parts[1]);
  }
  
  // 組合時間參數（例如 1h、20m、30s）
  let timeParam = '';
  if (hours > 0) timeParam += `${hours}h`;
  if (minutes > 0) timeParam += `${minutes}m`;
  if (seconds > 0) timeParam += `${seconds}s`;
  
  return timeParam;
}

// 新增輔助函數: 將時間字串轉換成純秒數
function convertTimeToSeconds(timeString) {
  timeString = timeString.trim();
  const parts = timeString.split(':').map(Number);
  let seconds = 0;
  if (parts.length === 3) {
    // HH:MM:SS 格式
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // MM:SS 格式
    seconds = parts[0] * 60 + parts[1];
  }
  return seconds;
}

function renderRecords() {
  const filteredRecords = currentFolder 
    ? records.filter(r => r.folderId === currentFolder)
    : records.filter(r => !r.folderId);

  // 按照直播標題分組
  const groupedRecords = {};
  filteredRecords.forEach(record => {
    if (!groupedRecords[record.title]) {
      groupedRecords[record.title] = [];
    }
    groupedRecords[record.title].push(record);
  });

  // 生成 HTML
  UI.recordsList.innerHTML = Object.entries(groupedRecords).map(([title, groupRecords]) => {
    const recordsHtml = groupRecords.map(record => {
      const timeParam = formatTimeForUrl(record.liveTime);
      const videoUrl = record.channelUrl + (timeParam ? `?t=${timeParam}` : '');
      
      return `
        <div class="record-item" 
             data-id="${record.id}"
             data-group="${title}"
             data-jump-url="${videoUrl}"
             draggable="true">
          <div class="record-header">
            <div>
              <div class="record-topic" data-id="${record.id}">${record.topic}</div>
            </div>
            <div class="action-buttons">
              <button class="copy-btn" title="前往影片時間點">
                <img src="../icons/forward128.png" width="16" height="16" alt="前往時間點">
              </button>
              <button class="delete-btn" title="刪除此紀錄">✖</button>
            </div>
          </div>
          <div class="record-time">
            <span class="record-timestamp">${record.timestamp}</span>
            <span class="record-playback-time" 
                  data-jump-url="${videoUrl}" 
                  title="點擊跳轉到此影片時間點">
              ${record.liveTime}
            </span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="records-group" draggable="true" data-title="${title}">
        <div class="group-header">
          <div class="group-title">${title}</div>
          <div class="group-info">
            <span class="group-count">${groupRecords.length}</span>
            <span class="group-toggle">▼</span>
          </div>
        </div>
        <div class="group-content show">
          ${recordsHtml}
        </div>
      </div>
    `;
  }).join('');

  // 移除之前的事件監聽器
  UI.recordsList.removeEventListener('click', handleDeleteClick);
  UI.recordsList.removeEventListener('click', handleCopyClick);
  
  // 重新添加事件監聽器
  UI.recordsList.addEventListener('click', handleDeleteClick);
  UI.recordsList.addEventListener('click', handleCopyClick);
  
  // 為所有 record-topic 添加雙擊事件
  document.querySelectorAll('.record-topic').forEach(topic => {
    topic.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      handleTopicDoubleClick(e, topic.dataset.id);
    });
  });

  // 為所有標題區域添加點擊事件
  document.querySelectorAll('.group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      const toggle = header.querySelector('.group-toggle');
      toggleGroup(e, toggle);
    });
  });

  // 添加群組拖曳相關事件
  document.querySelectorAll('.records-group').forEach(group => {
    group.addEventListener('dragstart', handleGroupDragStart);
    group.addEventListener('dragend', handleGroupDragEnd);
    group.addEventListener('dragover', handleGroupDragOver);
    group.addEventListener('drop', handleGroupDrop);
  });

  // 添加記錄拖曳相關事件
  document.querySelectorAll('.record-item').forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleRecordDragOver);
    item.addEventListener('drop', handleRecordDrop);
  });
}

// 群組拖曳相關函數
function handleGroupDragStart(e) {
  const group = e.currentTarget;
  group.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  dragState = {
    type: 'group',
    title: group.dataset.title
  };
}

function handleGroupDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  dragState = null;
}

function handleGroupDragOver(e) {
  e.preventDefault();
  if (!dragState || dragState.type !== 'group') return;

  const group = e.currentTarget;
  if (group.classList.contains('dragging')) return;

  const draggingGroup = document.querySelector('.records-group.dragging');
  if (!draggingGroup || draggingGroup === group) return;

  const rect = group.getBoundingClientRect();
  const threshold = rect.top + rect.height / 2;

  if (e.clientY < threshold) {
    group.parentNode.insertBefore(draggingGroup, group);
  } else {
    group.parentNode.insertBefore(draggingGroup, group.nextSibling);
  }
}

async function handleGroupDrop(e) {
  e.preventDefault();
  if (!dragState || dragState.type !== 'group') return;

  const groups = [...document.querySelectorAll('.records-group')];
  const newRecords = [...records];

  // 根據新的群組順序重新排序記錄
  groups.forEach(group => {
    const groupTitle = group.dataset.title;
    const groupRecords = newRecords.filter(r => r.title === groupTitle);
    // 將該群組的記錄從陣列中移除
    newRecords.splice(0, newRecords.length, ...newRecords.filter(r => r.title !== groupTitle));
    // 將該群組的記錄添加到陣列末尾
    newRecords.push(...groupRecords);
  });

  // 保存新順序
  records = newRecords;
  await chrome.storage.local.set({ timeRecords: records });
  showTempStatus('✓ 已更新群組順序');
}

async function handleDeleteClick(e) {
  const deleteBtn = e.target.closest('.delete-btn');
  if (!deleteBtn) return;

  const recordId = deleteBtn.closest('.record-item').dataset.id;
  records = records.filter(r => r.id !== recordId);
  
  await chrome.storage.local.set({ timeRecords: records });
  renderFolders();
  renderRecords();
  showTempStatus('✓ 已刪除記錄');
}

// 記錄拖曳相關函數
function handleDragStart(e) {
  const recordItem = e.target.closest('.record-item');
  if (!recordItem) return;

  recordItem.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  dragState = {
    type: 'record',
    id: recordItem.dataset.id,
    group: recordItem.dataset.group
  };
}

function handleDragEnd(e) {
  e.target.closest('.record-item')?.classList.remove('dragging');
  dragState = null;
}

function handleRecordDragOver(e) {
  e.preventDefault();
  const recordItem = e.target.closest('.record-item');
  if (!recordItem || !dragState || dragState.type !== 'record') return;
  
  // 確保在同一組內拖曳
  if (recordItem.dataset.group !== dragState.group) return;

  const draggingItem = document.querySelector('.record-item.dragging');
  if (!draggingItem || draggingItem === recordItem) return;

  const rect = recordItem.getBoundingClientRect();
  const threshold = rect.top + rect.height / 2;
  
  if (e.clientY < threshold) {
    recordItem.parentNode.insertBefore(draggingItem, recordItem);
  } else {
    recordItem.parentNode.insertBefore(draggingItem, recordItem.nextSibling);
  }
}

async function handleRecordDrop(e) {
  e.preventDefault();
  const container = e.target.closest('.group-content');
  if (!container || !dragState || dragState.type !== 'record') return;

  const items = [...container.querySelectorAll('.record-item')];
  const newRecords = [...records];
  
  // 更新記錄順序
  items.forEach((item, index) => {
    const recordId = item.dataset.id;
    const recordIndex = newRecords.findIndex(r => r.id === recordId);
    if (recordIndex !== -1) {
      const record = newRecords.splice(recordIndex, 1)[0];
      newRecords.splice(index, 0, record);
    }
  });

  // 保存新順序
  records = newRecords;
  await chrome.storage.local.set({ timeRecords: records });
  renderRecords();
  showTempStatus('✓ 已更新記錄順序');
}

function getDragAfterElement(container, y, type) {
  const selector = type === 'folder' ? 
    '.folder-item:not(.dragging):not(.uncategorized)' : 
    '.record-item:not(.dragging)';
  
  return [...container.querySelectorAll(selector)].reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    return offset < 0 && offset > closest.offset ? 
      { offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function handleRecordClick() {
  if (isRecording) return;
  isRecording = true;
  UI.recordBtn.disabled = true;

  try {
    UI.statusEl.textContent = '記錄中...';
    
    // 檢查頁面是否已經準備好
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 嘗試重新注入 content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (error) {
      console.log('Content script 已存在或注入失敗:', error);
    }

    // 添加重試機制
    let retryCount = 0;
    const maxRetries = 3;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        const [timeResponse, titleResponse, channelResponse] = await Promise.all([
          chrome.tabs.sendMessage(tab.id, { action: "getCurrentTime" }),
          chrome.tabs.sendMessage(tab.id, { action: "getStreamTitle" }),
          chrome.tabs.sendMessage(tab.id, { action: "getChannelUrl" })
        ]);

        if (!timeResponse.success) {
          handleTimeError(timeResponse.error);
          return;
        }

        const newRecord = {
          id: Date.now().toString(),
          timestamp: new Date().toLocaleString(),
          liveTime: timeResponse.time,
          title: titleResponse.title || '無標題直播',
          topic: UI.titleInput.value.trim() || '無主題',
          folderId: currentFolder || null,
          channelUrl: channelResponse.url
        };

        records = [newRecord, ...records].slice(0, 100);
        UI.titleInput.value = '';
        
        await chrome.storage.local.set({ timeRecords: records });
        renderFolders();
        renderRecords();
        
        showTempStatus('✓ 記錄成功');
        return;
      } catch (error) {
        lastError = error;
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 500)); // 等待 500ms 後重試
      }
    }

    // 如果所有重試都失敗了
    if (lastError) {
      console.error('重試失敗:', lastError);
      showErrorMessage('無法與頁面建立連線，請重新整理頁面後再試');
    }
  } catch (error) {
    handleRuntimeError(error);
  } finally {
    isRecording = false;
    UI.recordBtn.disabled = false;
  }
}

function getFolderName(folderId) {
  if (folderId === 'uncategorized') return '未分類';
  return folders.find(f => f.id === folderId)?.name || '未知資料夾';
}

function showTempStatus(message, duration = 1500) {
  UI.statusEl.textContent = message;
  setTimeout(() => UI.statusEl.textContent = '就緒', duration);
}

// 現在同時支持 Twitch 與 YouTube 影片頁面
function isValidTwitchPage(url) {
  return url?.includes('twitch.tv') || url?.includes('youtube.com/watch') || url?.includes('youtu.be');
}

function handleTimeError(errorCode) {
  console.error('Time error:', errorCode);
  UI.statusEl.textContent = '✕ 時間獲取失敗';
}

function showErrorMessage(message) {
  UI.statusEl.innerHTML = `<div class="error-message">${message}</div>`;
  setTimeout(() => {
    UI.statusEl.textContent = '就緒';
  }, 3000);
}

function handleCriticalError(context, error) {
  console.error(`${context}:`, error);
  showErrorMessage('嚴重錯誤，請重新載入頁面');
}

function handleRuntimeError(error) {
  console.error('Runtime error:', error);
  UI.statusEl.textContent = '✕ 發生錯誤';
}

async function handleCreateFolder(e) {
  e.stopPropagation();
  const addButton = e.target;
  const folderHeader = addButton.closest('.folder-header');
  const headerText = folderHeader.querySelector('span');
  
  // 創建編輯容器
  const editContainer = document.createElement('div');
  editContainer.className = 'edit-container new-folder-container';
  editContainer.onclick = (e) => e.stopPropagation();
  
  // 創建輸入框
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.placeholder = '輸入資料夾名稱';
  
  // 創建確認按鈕
  const confirmBtn = document.createElement('button');
  confirmBtn.innerHTML = '✓';
  confirmBtn.className = 'confirm-edit-btn';
  
  // 組裝編輯界面
  editContainer.appendChild(input);
  editContainer.appendChild(confirmBtn);
  
  // 隱藏標題文字和加號按鈕
  headerText.style.display = 'none';
  addButton.style.display = 'none';
  
  // 將編輯容器插入到 folder-header 中
  folderHeader.appendChild(editContainer);
  input.focus();
  
  // 處理確認新增
  const handleConfirm = async () => {
    const folderName = input.value.trim();
    if (folderName) {
      const newFolder = {
        id: `folder-${Date.now()}`,
        name: folderName,
        created: new Date().toISOString()
      };
      folders.push(newFolder);
      await chrome.storage.local.set({ folders });
      renderFolders();
      showTempStatus('✓ 已新增資料夾');
    }
    cleanup();
  };
  
  // 綁定事件
  confirmBtn.onclick = (e) => {
    e.stopPropagation();
    handleConfirm();
  };
  
  input.onkeypress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleConfirm();
    }
  };
  
  // 點擊其他地方取消編輯
  const handleClickOutside = (e) => {
    if (!editContainer.contains(e.target)) {
      cleanup();
    }
  };
  
  // 清理函數
  const cleanup = () => {
    editContainer.remove();
    headerText.style.display = '';
    addButton.style.display = '';
    document.removeEventListener('click', handleClickOutside);
  };
  
  // 延遲添加點擊監聽，避免立即觸發
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 0);
}

function handleTopicDoubleClick(event, recordId) {
  event.preventDefault(); // 防止觸發拖曳
  const topicElement = event.target;
  const originalText = topicElement.textContent;
  
  // 創建編輯容器
  const editContainer = document.createElement('div');
  editContainer.className = 'edit-container';
  editContainer.onclick = (e) => e.stopPropagation(); // 防止點擊事件冒泡
  
  // 創建輸入框
  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalText;
  input.className = 'edit-input';
  
  // 防止輸入框觸發拖曳
  input.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  
  // 創建確認按鈕
  const confirmBtn = document.createElement('button');
  confirmBtn.innerHTML = '✓';
  confirmBtn.className = 'confirm-edit-btn';
  
  // 組裝編輯界面
  editContainer.appendChild(input);
  editContainer.appendChild(confirmBtn);
  
  // 替換原有元素
  topicElement.replaceWith(editContainer);
  input.focus();
  
  // 處理確認修改
  const handleConfirm = async () => {
    const newText = input.value.trim();
    if (newText) {
      const record = records.find(r => r.id === recordId);
      if (record) {
        record.topic = newText;
        await chrome.storage.local.set({ timeRecords: records });
        renderRecords();
        showTempStatus('✓ 已更新主題');
      }
    }
  };
  
  // 綁定事件
  confirmBtn.onclick = (e) => {
    e.stopPropagation();
    handleConfirm();
  };
  
  input.onkeypress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleConfirm();
    }
  };
  
  // 點擊其他地方取消編輯
  const handleClickOutside = (e) => {
    if (!editContainer.contains(e.target)) {
      renderRecords();
      document.removeEventListener('click', handleClickOutside);
    }
  };
  
  // 延遲添加點擊監聽，避免立即觸發
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 0);
}

// 將函數定義為全局函數
window.handleFolderNameDoubleClick = function(event, folderId) {
  event.preventDefault();
  const nameElement = event.target;
  const originalText = nameElement.textContent.replace('📁 ', ''); // 移除資料夾圖標
  
  // 創建編輯容器
  const editContainer = document.createElement('div');
  editContainer.className = 'edit-container';
  editContainer.onclick = (e) => e.stopPropagation();
  editContainer.style.width = '90%'; // 調整寬度以適應資料夾面板
  
  // 創建輸入框
  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalText;
  input.className = 'edit-input';
  
  // 防止輸入框觸發拖曳
  input.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  
  // 創建確認按鈕
  const confirmBtn = document.createElement('button');
  confirmBtn.innerHTML = '✓';
  confirmBtn.className = 'confirm-edit-btn';
  
  // 組裝編輯界面
  editContainer.appendChild(input);
  editContainer.appendChild(confirmBtn);
  
  // 替換原有元素，保留資料夾圖標
  const folderIcon = document.createElement('span');
  folderIcon.textContent = '📁 ';
  editContainer.insertBefore(folderIcon, input);
  
  nameElement.replaceWith(editContainer);
  input.focus();
  
  // 處理確認修改
  const handleConfirm = async () => {
    const newText = input.value.trim();
    if (newText) {
      const folder = folders.find(f => f.id === folderId);
      if (folder) {
        folder.name = newText;
        await chrome.storage.local.set({ folders });
        renderFolders();
        showTempStatus('✓ 已更新資料夾名稱');
      }
    }
  };
  
  // 綁定事件
  confirmBtn.onclick = (e) => {
    e.stopPropagation();
    handleConfirm();
  };
  
  input.onkeypress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleConfirm();
    }
  };
  
  // 點擊其他地方取消編輯
  const handleClickOutside = (e) => {
    if (!editContainer.contains(e.target)) {
      renderFolders();
      document.removeEventListener('click', handleClickOutside);
    }
  };
  
  // 延遲添加點擊監聽，避免立即觸發
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 0);
};

// 替換原來的 removeAllPreviewIndicators 函數
function removeAllPreviewEffects() {
  document.querySelectorAll('.folder-item').forEach(item => {
    item.classList.remove('preview-above', 'preview-below');
  });
}

// 修改折疊功能
function toggleGroup(event, toggleBtn) {
  event.stopPropagation(); // 阻止事件冒泡
  const header = toggleBtn.closest('.group-header');
  const content = header.nextElementSibling;
  
  if (content.classList.contains('show')) {
    // 收起
    content.classList.remove('show');
    toggleBtn.textContent = '▶';
    header.classList.add('collapsed');
  } else {
    // 展開
    content.classList.add('show');
    toggleBtn.textContent = '▼';
    header.classList.remove('collapsed');
  }
}

function handleKeyPress(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleRecordClick();
  }
}

// 新增：根據目前頁面 URL 決定主題色系
function updateTheme() {
  if (currentTab && (currentTab.url.includes("youtube.com") || currentTab.url.includes("youtu.be"))) {
    document.body.classList.add("theme-youtube");
  } else {
    document.body.classList.remove("theme-youtube");
  }
}

// 處理匯出功能
async function handleExport() {
  try {
    // 從 storage 取得所有資料
    const [foldersData, recordsData] = await Promise.all([
      chrome.storage.local.get('folders'),
      chrome.storage.local.get('timeRecords')
    ]);
  
    // 使用 storage 中的完整資料
    const allFolders = foldersData.folders || [];
    const allRecords = recordsData.timeRecords || [];
  
    // 準備匯出資料
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      folders: allFolders,
      records: allRecords
    };
  
    // 轉換成 JSON 並建立下載連結
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twitch-marker-export-${new Date().toISOString().slice(0,10)}.json`;
    
    // 觸發下載
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showTempStatus('✓ 匯出成功');
  } catch (error) {
    console.error('匯出失敗:', error);
    showTempStatus('✕ 匯出失敗');
  }
}

// 處理匯入功能
async function handleImport(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        
        // 驗證資料格式
        if (!importData.version || !importData.folders || !importData.records) {
          throw new Error('無效的匯入檔案格式');
        }

        // 取得目前的資料
        const [currentFoldersData, currentRecordsData] = await Promise.all([
          chrome.storage.local.get('folders'),
          chrome.storage.local.get('timeRecords')
        ]);

        const currentFolders = currentFoldersData.folders || [];
        let currentRecords = currentRecordsData.timeRecords || [];

        // 合併資料夾（跳過已存在的）
        // 保持匯入的資料夾順序
        const updatedFolders = [];
        // 先加入匯入的資料夾（跳過已存在的）
        importData.folders.forEach(importFolder => {
          if (!currentFolders.some(f => f.id === importFolder.id)) {
            updatedFolders.push(importFolder);
          }
        });
        // 再加入當前已存在但不在匯入資料中的資料夾
        currentFolders.forEach(folder => {
          if (!updatedFolders.some(f => f.id === folder.id)) {
            updatedFolders.push(folder);
          }
        });

        // 處理記錄
        let updatedRecords = [];
        let importedCount = 0;

        // 先處理匯入的記錄，保持順序
        importData.records.forEach(importRecord => {
          const existingRecord = currentRecords.find(r => r.id === importRecord.id);
          
          if (!existingRecord) {
            // 完全新的記錄
            updatedRecords.push({ ...importRecord });
            importedCount++;
          } else if (!existingRecord.folderId && importRecord.folderId) {
            // 現有記錄在未分類中且匯入的記錄有指定資料夾
            updatedRecords.push({
              ...existingRecord,
              folderId: importRecord.folderId
            });
            importedCount++;
            // 從現有記錄中移除已處理的記錄
            currentRecords = currentRecords.filter(r => r.id !== existingRecord.id);
          }
        });

        // 加入剩餘的現有記錄
        updatedRecords.push(...currentRecords);

        // 更新 storage
        await Promise.all([
          chrome.storage.local.set({ 
            folders: updatedFolders
          }),
          chrome.storage.local.set({ 
            timeRecords: updatedRecords
          })
        ]);

        // 重新載入介面
        await loadAllData();
        showTempStatus(`✓ 已匯入 ${updatedFolders.length - currentFolders.length} 個資料夾，${importedCount} 筆記錄`);
      } catch (error) {
        console.error('處理匯入資料時發生錯誤:', error);
        showTempStatus('✕ 匯入失敗：無效的檔案格式');
      }
    };

    reader.readAsText(file);
  } catch (error) {
    console.error('匯入失敗:', error);
    showTempStatus('✕ 匯入失敗');
  } finally {
    // 清除檔案選擇，使得可以重複選擇同一個檔案
    event.target.value = '';
  }
}