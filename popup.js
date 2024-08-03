document.addEventListener('DOMContentLoaded', () => {
  const saveButton = document.getElementById('saveDomain');
  const domainInput = document.getElementById('domain');
  const savedDomainsList = document.getElementById('savedDomains');
  const extractButton = document.getElementById('extract');
  const savedLinksList = document.getElementById('savedLinks');
  const downloadButton = document.getElementById('downloadLinks');
  const deleteSelectedDomainsButton = document.getElementById('deleteSelectedDomains');
  const deleteSelectedLinksButton = document.getElementById('deleteSelectedLinks');
  const deleteAllLinksButton = document.getElementById('deleteAllLinks');

  function updateSavedDomains() {
    chrome.storage.local.get('domains', (result) => {
      const domains = result.domains || [];
      savedDomainsList.innerHTML = '';
      domains.forEach(domain => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
          <input type="checkbox" class="domainCheckbox" value="${domain}">
          <span>${domain}</span>
          <button class="deleteDomain">Delete</button>
        `;
        listItem.querySelector('.deleteDomain').addEventListener('click', () => deleteDomain(domain));
        savedDomainsList.appendChild(listItem);
      });
    });
  }

  function updateSavedLinks() {
    chrome.storage.local.get('links', (result) => {
      const sessions = result.links || {};
      savedLinksList.innerHTML = '';
      let linkCount = 1;
      for (const [sessionId, links] of Object.entries(sessions)) {
        links.forEach(link => {
          const listItem = document.createElement('li');
          listItem.innerHTML = `
            <input type="checkbox" class="linkCheckbox" value="${sessionId}:${link}">
            <span>${linkCount++}. ${sessionId}: ${link}</span>
            <button class="deleteLink">Delete</button>
          `;
          listItem.querySelector('.deleteLink').addEventListener('click', () => deleteLink(sessionId, link));
          savedLinksList.appendChild(listItem);
        });
      }
    });
  }

  function deleteDomain(domain) {
    chrome.storage.local.get('domains', (result) => {
      const domains = result.domains || [];
      const newDomains = domains.filter(d => d !== domain);
      chrome.storage.local.set({ domains: newDomains }, () => {
        updateSavedDomains();
      });
    });
  }

  function deleteLink(sessionId, linkToDelete) {
    chrome.storage.local.get('links', (result) => {
      const sessions = result.links || {};
      if (sessions[sessionId]) {
        const newLinks = sessions[sessionId].filter(link => link !== linkToDelete);
        if (newLinks.length > 0) {
          sessions[sessionId] = newLinks;
        } else {
          delete sessions[sessionId];
        }
        chrome.storage.local.set({ links: sessions }, () => {
          updateSavedLinks();
        });
      }
    });
  }

  function deleteSelectedDomains() {
    const checkboxes = document.querySelectorAll('.domainCheckbox:checked');
    const domainsToDelete = Array.from(checkboxes).map(cb => cb.value);
    if (domainsToDelete.length > 0) {
      chrome.storage.local.get('domains', (result) => {
        const domains = result.domains || [];
        const newDomains = domains.filter(d => !domainsToDelete.includes(d));
        chrome.storage.local.set({ domains: newDomains }, () => {
          updateSavedDomains();
        });
      });
    } else {
      alert('No domains selected for deletion.');
    }
  }

  function deleteSelectedLinks() {
    const checkboxes = document.querySelectorAll('.linkCheckbox:checked');
    const linksToDelete = Array.from(checkboxes).map(cb => {
      const [sessionId, link] = cb.value.split(':');
      return { sessionId, link };
    });
    if (linksToDelete.length > 0) {
      chrome.storage.local.get('links', (result) => {
        const sessions = result.links || {};
        linksToDelete.forEach(({ sessionId, link }) => {
          if (sessions[sessionId]) {
            const newLinks = sessions[sessionId].filter(l => l !== link);
            if (newLinks.length > 0) {
              sessions[sessionId] = newLinks;
            } else {
              delete sessions[sessionId];
            }
          }
        });
        chrome.storage.local.set({ links: sessions }, () => {
          updateSavedLinks();
        });
      });
    } else {
      alert('No links selected for deletion.');
    }
  }

  function deleteAllLinks() {
    chrome.storage.local.set({ links: {} }, () => {
      updateSavedLinks();
    });
  }

  function extractAllDomains() {
    chrome.storage.local.get('domains', (result) => {
      const domains = result.domains || [];
      if (domains.length > 0) {
        chrome.storage.local.get('links', (result) => {
          const processedDomains = new Set(Object.keys(result.links || {}).map(id => result.links[id][0].split(':')[0]));

          const domainsToProcess = domains.filter(domain => !processedDomains.has(domain));

          if (domainsToProcess.length > 0) {
            chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }, (tabs) => {
              const sessionId = Date.now().toString();
              let promises = tabs.map(tab => {
                return new Promise((resolve) => {
                  chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                  }, () => {
                    let domainPromises = domainsToProcess.map(domain => {
                      return new Promise((resolve) => {
                        chrome.tabs.sendMessage(tab.id, { action: 'extractLinks', domain }, (response) => {
                          if (chrome.runtime.lastError) {
                            console.error('Error sending message to content script:', chrome.runtime.lastError.message);
                            resolve({ sessionId, links: [] }); // Resolve with empty links to continue processing other domains
                            return;
                          }
                          if (response.error) {
                            console.error('Error from content script:', response.error);
                            resolve({ sessionId, links: [] }); // Resolve with empty links to continue processing other domains
                            return;
                          }
                          resolve({ sessionId, links: response.links });
                        });
                      });
                    });

                    Promise.all(domainPromises)
                      .then(results => {
                        const links = results.reduce((acc, { sessionId, links }) => {
                          if (links.length > 0) {
                            acc[sessionId] = acc[sessionId] ? acc[sessionId].concat(links) : links;
                          }
                          return acc;
                        }, {});

                        chrome.storage.local.get('links', (result) => {
                          const storedLinks = result.links || {};
                          Object.keys(links).forEach(sessionId => {
                            storedLinks[sessionId] = storedLinks[sessionId] ? storedLinks[sessionId].concat(links[sessionId]) : links[sessionId];
                            storedLinks[sessionId] = [...new Set(storedLinks[sessionId])]; // Remove duplicates
                          });
                          chrome.storage.local.set({ links: storedLinks }, () => {
                            updateSavedLinks();
                          });
                        });
                      });
                  });
                });
              });

              Promise.all(promises).then(() => {
                updateSavedLinks();
              });
            });
          }
        });
      }
    });
  }

  saveButton.addEventListener('click', () => {
    const domain = domainInput.value.trim();
    if (domain) {
      chrome.storage.local.get('domains', (result) => {
        const domains = result.domains || [];
        if (!domains.includes(domain)) {
          domains.push(domain);
          chrome.storage.local.set({ domains }, () => {
            updateSavedDomains();
          });
        }
      });
    }
  });

  downloadButton.addEventListener('click', () => {
    chrome.storage.local.get('links', (result) => {
      const sessions = result.links || {};
      const links = Object.values(sessions).flat();
      const blob = new Blob([links.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'links.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  deleteSelectedDomainsButton.addEventListener('click', deleteSelectedDomains);
  deleteSelectedLinksButton.addEventListener('click', deleteSelectedLinks);
  deleteAllLinksButton.addEventListener('click', deleteAllLinks);
  extractButton.addEventListener('click', extractAllDomains);

  updateSavedDomains();
  updateSavedLinks();
});
