chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.storage.local.get('domains', (result) => {
      const domains = result.domains || [];
      if (domains.length > 0) {
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        }, () => {
          domains.forEach(domain => {
            chrome.tabs.sendMessage(tabId, { action: 'extractLinks', domain }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Error sending message to content script:', chrome.runtime.lastError.message);
                return;
              }
              if (response && response.links) {
                chrome.storage.local.get('links', (result) => {
                  const storedLinks = result.links || {};
                  const sessionId = Date.now().toString();
                  storedLinks[sessionId] = storedLinks[sessionId] || [];
                  const uniqueLinks = [...new Set([...storedLinks[sessionId], ...response.links])];
                  storedLinks[sessionId] = uniqueLinks;
                  chrome.storage.local.set({ links: storedLinks });
                });
              }
            });
          });
        });
      }
    });
  }
});
