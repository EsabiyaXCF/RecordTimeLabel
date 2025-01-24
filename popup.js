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
let dragState = { type: null, id: null, source: null };

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
    
    const { title } = await chrome.tabs.sendMessage(currentTab.id, { 
      action: "getStreamTitle" 
    });
    UI.titleInput.placeholder = title || '輸入時間點備註';

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
  UI.recordsList.addEventListener('dragstart', handleDragStart);
  UI.recordsList.addEventListener('dragend', handleDragEnd);
  UI.foldersList.addEventListener('dragover', handleDragOver);
  UI.foldersList.addEventListener('dragleave', handleDragLeave);
  UI.foldersList.addEventListener('drop', handleDrop);
}

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
    currentFolder = folderItem.dataset.id;
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
  UI.foldersList.innerHTML = folders.map(folder => `
    <div class="folder-item ${currentFolder === folder.id ? 'selected' : ''}" 
         data-id="${folder.id}"
         draggable="false">
      <button class="folder-delete-btn" aria-label="刪除資料夾">×</button>
      <div>📁 ${folder.name}</div>
      <div class="folder-count">
        ${records.filter(r => r.folderId === folder.id).length}
      </div>
    </div>
  `).join('');
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
          <div class="record-topic">${record.topic}</div>
          <div class="record-title">${record.title}</div>
        </div>
        <button class="delete-btn" aria-label="刪除">&times;</button>
      </div>
      <div class="record-time">
        <span>${record.timestamp}</span>
        <span>${record.liveTime}</span>
      </div>
    </div>
  `).join('');

  UI.recordsList.addEventListener('click', handleDeleteClick);
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

  dragState = {
    type: item.classList.contains('record-item') ? 'record' : 'folder',
    id: item.dataset.id,
    source: item.parentElement
  };

  if (dragState.type === 'record') {
    e.dataTransfer.setData('text/plain', dragState.id);
    item.classList.add('dragging');
  }
}

function handleDragEnd(e) {
  document.querySelectorAll('.dragging, .dragover').forEach(el => {
    el.classList.remove('dragging', 'dragover');
  });
  dragState = { type: null, id: null, source: null };
}

function handleDragOver(e) {
  e.preventDefault();
  document.querySelectorAll('.folder-item.dragover').forEach(folder => {
    folder.classList.remove('dragover');
  });

  const targetFolder = e.target.closest('.folder-item');
  if (targetFolder && dragState.type === 'record') {
    targetFolder.classList.add('dragover');
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
  e.preventDefault();
  const targetFolder = e.target.closest('.folder-item');
  if (!targetFolder || dragState.type !== 'record') return;

  const recordId = dragState.id;
  const folderId = targetFolder.dataset.id;
  const record = records.find(r => r.id === recordId);

  if (record.folderId === folderId) {
    showTempStatus('記錄已在目標文件夾');
    return;
  }

  currentFolder = folderId;
  record.folderId = folderId;
  await chrome.storage.local.set({ timeRecords: records });
  
  renderFolders();
  renderRecords();
  showTempStatus(`✓ 已移動至「${getFolderName(folderId)}」`);
}

async function handleRecordClick() {
  if (isRecording) return;
  isRecording = true;
  UI.recordBtn.disabled = true;

  try {
    UI.statusEl.textContent = '記錄中...';
    
    const [timeResponse, titleResponse] = await Promise.all([
      chrome.tabs.sendMessage(currentTab.id, { action: "getCurrentTime" }),
      chrome.tabs.sendMessage(currentTab.id, { action: "getStreamTitle" })
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
      folderId: currentFolder || null
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

// 工具函數
function getFolderName(folderId) {
  return folders.find(f => f.id === folderId)?.name || '未知資料夾';
}

function showTempStatus(message, duration = 1500) {
  UI.statusEl.textContent = message;
  setTimeout(() => UI.statusEl.textContent = '就緒', duration);
}

function isValidTwitchPage(url) {
  return url?.includes('twitch.tv');
}

// 錯誤處理
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

async function handleCreateFolder() {
  const folderName = prompt('請輸入資料夾名稱：');
  if (folderName?.trim()) {
    const newFolder = {
      id: `folder-${Date.now()}`,
      name: folderName.trim(),
      created: new Date().toISOString()
    };
    folders.push(newFolder);
    await chrome.storage.local.set({ folders });
    renderFolders();
  }
}