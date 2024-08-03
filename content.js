chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractLinks') {
    const domain = request.domain;
    const links = Array.from(document.querySelectorAll('a[href]'))
      .map(link => link.href)
      .filter(href => {
        try {
          return new URL(href).hostname.includes(domain);
        } catch (e) {
          console.error('Error parsing URL:', e);
          return false;
        }
      });
    sendResponse({ links });
  }
});

// Automatically extract links when the page loads
function extractLinksAutomatically() {
  chrome.storage.local.get(['domains', 'links'], (result) => {
    const domains = result.domains || [];
    const storedLinks = result.links || {};

    domains.forEach(domain => {
      chrome.runtime.sendMessage({ action: 'extractLinks', domain }, (response) => {
        if (response.links.length > 0) {
          const newLinks = response.links.filter(link => {
            // Check if the link is already stored
            return !Object.values(storedLinks).flat().includes(link);
          });

          if (newLinks.length > 0) {
            const sessionId = Date.now().toString();
            storedLinks[sessionId] = (storedLinks[sessionId] || []).concat(newLinks);
            chrome.storage.local.set({ links: storedLinks });
          }
        }
      });
    });
  });
}

// Run the extraction process when the page finishes loading
extractLinksAutomatically();
