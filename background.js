chrome.runtime.onInstalled.addListener(() => {
  // Initialize the disablelist.
  chrome.storage.sync.get('disablelist', (res) => {
    if (!res['disablelist'] || chrome.runtime.lastError) {
      chrome.storage.sync.set({'disablelist' : []});
    }
  });
});

// Simply listen for events and respond.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!sender.tab) {
    return;
  }

  switch (request.event) {
  case 'back':
    chrome.tabs.goBack(sender.tab.id);
    break;
  case 'forward':
    chrome.tabs.goForward(sender.tab.id);
    break;
  case 'duplicate':
    chrome.tabs.duplicate(sender.tab.id);
    break;
  }
});
