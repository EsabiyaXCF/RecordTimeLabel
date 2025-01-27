const UI = {
  titleInput: document.getElementById('titleInput'),
  recordBtn: document.getElementById('recordBtn'),
  statusEl: document.getElementById('status'),
  recordsList: document.getElementById('recordsList'),
  foldersList: document.getElementById('foldersList'),
  addFolderBtn: document.getElementById('addFolderBtn')
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
      showErrorMessage('請在Twitch直播頁面使用本功能');
      UI.recordBtn.disabled = true;
      return;
    }

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

// ============== 修改开始 ==============
function setupEventListeners() {
  UI.recordBtn.addEventListener('click', handleRecordClick);
  UI.titleInput.addEventListener('keypress', handleKeyPress);
  UI.addFolderBtn.addEventListener('click', handleCreateFolder);
  UI.foldersList.addEventListener('click', handleFolderClick);
  
  // 修改拖曳事件监听逻辑
  UI.recordsList.addEventListener('dragstart', handleDragStart);
  UI.recordsList.addEventListener('dragend', handleDragEnd);
  UI.foldersList.addEventListener('dragover', handleCombinedDragOver);
  UI.foldersList.addEventListener('dragleave', handleDragLeave);
  UI.foldersList.addEventListener('drop', handleCombinedDrop);
  
  // 恢复记录栏排序监听
  UI.recordsList.addEventListener('dragover', handleRecordsDragOver);
  UI.recordsList.addEventListener('drop', handleRecordsDrop);

  UI.recordsList.addEventListener('click', handleDeleteClick);
  UI.recordsList.addEventListener('click', handleCopyClick);
}
async function handleCopyClick(e) {
  const copyBtn = e.target.closest('.copy-btn');
  if (!copyBtn) return;

  const recordItem = copyBtn.closest('.record-item');
  const timeToCopy = recordItem.querySelector('.record-time span:last-child').textContent;
  
  try {
    await navigator.clipboard.writeText(timeToCopy);
    showTempStatus('✓ 已複製時間點');
  } catch (err) {
    console.error('複製失敗:', err);
    showTempStatus('✕ 複製失敗');
  }
}
// 新增组合事件处理函数
function handleCombinedDragOver(e) {
  if (dragState.type === 'folder') {
    handleSortDragOver(e);
  } else {
    handleDragOver(e);
  }
}

function handleCombinedDrop(e) {
  if (dragState.type === 'folder') {
    handleSortDrop(e);
  } else {
    handleDrop(e);
  }
}

// 记录栏专属拖曳处理
function handleRecordsDragOver(e) {
  if (dragState.type === 'record') handleSortDragOver(e);
}
async function handleRecordsDrop(e) {
  if (dragState.type === 'record') handleSortDrop(e);
}

// 修改排序逻辑
function handleSortDragOver(e) {
  e.preventDefault();
  if (!dragState.type) return;

  // 严格限制操作区域
  const isFolderOperation = e.currentTarget === UI.foldersList && dragState.type === 'folder';
  const isRecordOperation = e.currentTarget === UI.recordsList && dragState.type === 'record';
  if (!isFolderOperation && !isRecordOperation) return;

  // 排除未分类文件夹和拖拽中元素
  const validChildren = [...e.currentTarget.children].filter(child => 
    !child.classList.contains('uncategorized') && 
    !child.classList.contains('dragging')
  );

  // 精确计算插入位置
  const afterElement = validChildren.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = e.clientY - box.top - box.height / 2;
    return offset < 0 && offset > closest.offset ? 
      { offset: offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;

  const draggable = document.querySelector('.dragging');
  if (afterElement) {
    e.currentTarget.insertBefore(draggable, afterElement);
  } else {
    e.currentTarget.appendChild(draggable);
  }
}

// 修改handleSortDrop函数
async function handleSortDrop(e) {
  const container = e.currentTarget;
  const children = [...container.children];

  // 计算有效索引（排除未分类文件夹）
  let newIndex = -1;
  children.forEach((child, index) => {
    if (child.classList.contains('dragging') && !child.classList.contains('uncategorized')) {
      newIndex = index;
    }
  });

  if (newIndex === -1) return;

  // 处理文件夹排序
  if (dragState.type === 'folder') {
    // 转换为实际数组索引（需减去未分类占位）
    const actualIndex = Math.max(newIndex - 1, 0);
    const folder = folders.find(f => f.id === dragState.id);
    
    // 从原位置移除并插入新位置
    folders = folders.filter(f => f.id !== dragState.id);
    folders.splice(actualIndex, 0, folder);

    // 立即保存并更新界面
    await chrome.storage.local.set({ folders });
    renderFolders();
  }
  // 处理记录排序（保持原逻辑）
  else if (dragState.type === 'record') {
    const record = records.find(r => r.id === dragState.id);
    records = records.filter(r => r.id !== dragState.id);
    records.splice(newIndex, 0, record);
    await chrome.storage.local.set({ timeRecords: records });
    renderRecords();
  }

  dragState = { type: null, id: null, startIndex: -1, currentList: null };
}


// 以下为原始未修改代码
function handleKeyPress(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleRecordClick();
  }
}

function handleFolderClick(e) {
  const deleteBtn = e.target.closest('.folder-delete-btn');
  if (deleteBtn) {
    handleFolderDelete(deleteBtn);
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
        <div class="folder-name" data-id="${folder.id}" ondblclick="handleFolderNameDoubleClick(event, '${folder.id}')">📁 ${folder.name}</div>
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

  // 綁定其他原有的事件（如刪除按鈕等）
  UI.foldersList.addEventListener('click', handleFolderClick);
}

// 拖曳開始
function handleFolderDragStart(e) {
  e.stopPropagation();
  const folderItem = e.target.closest('.folder-item');
  folderItem.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', folderItem.dataset.id);
}

// 拖曳結束
function handleFolderDragEnd(e) {
  e.preventDefault();
  document.querySelector('.folder-item.dragging')?.classList.remove('dragging');
  removeAllPreviewEffects();
}

// 拖曳經過
function handleFolderDragOver(e) {
  e.preventDefault();
  const folderItem = e.target.closest('.folder-item');
  if (!folderItem || folderItem.classList.contains('uncategorized')) return;

  const draggingItem = document.querySelector('.folder-item.dragging');
  if (!draggingItem || draggingItem === folderItem) return;

  const foldersList = document.getElementById('foldersList');
  const folderItems = [...foldersList.querySelectorAll('.folder-item:not(.uncategorized)')];
  
  const draggingIndex = folderItems.indexOf(draggingItem);
  const targetIndex = folderItems.indexOf(folderItem);
  
  // 計算滑鼠位置
  const rect = folderItem.getBoundingClientRect();
  const mouseY = e.clientY;
  const threshold = rect.top + (rect.height / 2);
  
  // 移除當前拖曳項目
  draggingItem.parentNode.removeChild(draggingItem);
  
  // 根據滑鼠位置決定插入點
  if (mouseY < threshold) {
    folderItem.parentNode.insertBefore(draggingItem, folderItem);
  } else {
    folderItem.parentNode.insertBefore(draggingItem, folderItem.nextSibling);
  }

  e.dataTransfer.dropEffect = 'move';
}

// 處理拖放
async function handleFolderDrop(e) {
  e.preventDefault();
  const foldersList = document.getElementById('foldersList');
  const folderItems = [...foldersList.querySelectorAll('.folder-item:not(.uncategorized)')];
  
  // 根據當前 DOM 順序更新 folders 陣列
  const newFolders = folderItems.map(item => {
    const folderId = item.dataset.id;
    return folders.find(f => f.id === folderId);
  }).filter(Boolean); // 過濾掉可能的 undefined
  
  // 更新 folders 陣列
  folders = newFolders;

  // 保存新順序
  try {
    await chrome.storage.local.set({ folders });
    renderFolders();
    showTempStatus('✓ 已更新資料夾順序');
  } catch (error) {
    console.error('保存資料夾順序失敗:', error);
    showTempStatus('✕ 更新順序失敗');
  }
}

function renderRecords() {
  const filteredRecords = currentFolder 
    ? records.filter(r => r.folderId === currentFolder)
    : records.filter(r => !r.folderId);

  UI.recordsList.innerHTML = filteredRecords.map(record => `
    <div class="record-item" 
         data-id="${record.id}"
         draggable="true">
      <div class="record-header">
        <div>
          <div class="record-topic" data-id="${record.id}">${record.topic}</div>
          <div class="record-title">
            <a href="${record.channelUrl || '#'}" 
               target="_blank" 
               class="stream-link"
               title="前往影片列表">
              ${record.title}
            </a>
          </div>
        </div>
        <div class="action-buttons">
          <button class="copy-btn" title="複製時間點">⎘</button>
          <button class="delete-btn" aria-label="刪除">&times;</button>
        </div>
      </div>
      <div class="record-time">
        <span>${record.timestamp}</span>
        <span>${record.liveTime}</span>
      </div>
    </div>
  `).join('');

  // 移除之前的事件監聽器
  UI.recordsList.removeEventListener('click', handleDeleteClick);
  UI.recordsList.removeEventListener('click', handleCopyClick);
  
  // 重新添加事件監聽器
  UI.recordsList.addEventListener('click', handleDeleteClick);
  UI.recordsList.addEventListener('click', handleCopyClick);
  
  // 為所有 record-topic 添加雙擊事件
  document.querySelectorAll('.record-topic').forEach(topic => {
    topic.addEventListener('dblclick', (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      handleTopicDoubleClick(e, topic.dataset.id);
    });
  });
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

function handleDragStart(e) {
  const item = e.target.closest('[data-id]');
  if (!item) return;

  // 明确禁止未分类文件夹拖拽
  if (item.classList.contains('uncategorized')) {
    e.preventDefault();
    return;
  }

  // 精确判断文件夹类型
  const isFolder = item.classList.contains('folder-item') && 
                  !item.classList.contains('uncategorized');
  
  dragState = {
    type: isFolder ? 'folder' : 'record',
    id: item.dataset.id,
    startIndex: Array.from(item.parentElement.children).indexOf(item),
    currentList: isFolder ? folders : records
  };

  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  document.querySelectorAll('.dragging, .dragover').forEach(el => {
    el.classList.remove('dragging', 'dragover');
  });
  dragState = { type: null, id: null, startIndex: -1, currentList: null };
}

function handleDragOver(e) {
  e.preventDefault();
  document.querySelectorAll('.folder-item.dragover').forEach(folder => {
    folder.classList.remove('dragover');
  });

  const targetFolder = e.target.closest('.folder-item');
  if (targetFolder && dragState.type === 'record') {
    targetFolder.classList.add('dragover');
    e.dataTransfer.dropEffect = 'move';
  }
}

function handleDragLeave(e) {
  const leftFolder = e.target.closest('.folder-item');
  if (leftFolder) {
    setTimeout(() => {
      const currentPos = document.elementFromPoint(e.clientX, e.clientY);
      if (!leftFolder.contains(currentPos)) {
        leftFolder.classList.remove('dragover');
      }
    }, 10);
  }
}

async function handleDrop(e) {
  const targetFolder = e.target.closest('.folder-item');
  if (!targetFolder || dragState.type !== 'record') return;

  targetFolder.classList.remove('dragover');
  const record = records.find(r => r.id === dragState.id);
  const newFolderId = targetFolder.dataset.id === 'uncategorized' ? 
                     null : targetFolder.dataset.id;

  record.folderId = newFolderId;
  await chrome.storage.local.set({ timeRecords: records });
  
  currentFolder = newFolderId;
  renderFolders();
  renderRecords();
  showTempStatus(`✓ 已移動至「${getFolderName(newFolderId)}」`);
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
    
    const [timeResponse, titleResponse, channelResponse] = await Promise.all([
      chrome.tabs.sendMessage(currentTab.id, { action: "getCurrentTime" }),
      chrome.tabs.sendMessage(currentTab.id, { action: "getStreamTitle" }),
      chrome.tabs.sendMessage(currentTab.id, { action: "getChannelUrl" })
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

function isValidTwitchPage(url) {
  return url?.includes('twitch.tv');
}

function handleTimeError(errorCode) {
  console.error('Time error:', errorCode);
  UI.statusEl.textContent = '✕ 時間獲取失敗';
}

function showErrorMessage(message) {
  UI.statusEl.innerHTML = `<div class="error-message">${message}</div>`;
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