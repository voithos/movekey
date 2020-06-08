(function() {

/** The ID of the current tab. */
let tabId = null;
/** The current URL. */
let url = '';
/** The highest filter ID retrieved. */
let maxId = -1;
/** Whether or not the form has been saved or is new. */
let saved = false;

function init() {
  document.querySelector('.set-page')
      .addEventListener('click', () => setPage());
  document.querySelector('.set-domain')
      .addEventListener('click', () => setDomain());
  document.querySelector('.save').addEventListener('click',
                                                   () => saveFilters());

  chrome.storage.sync.get('blacklist', (res) => {
    const blacklist = res['blacklist'] || [];

    chrome.tabs.query({active : true, currentWindow : true}, (tabs) => {
      tabId = tabs[0].id;
      url = tabs[0].url;

      const matching = [];
      for (let item of blacklist) {
        maxId = Math.max(maxId, item.id);

        // Gather existing matches.
        const r = new RegExp(item.filter);
        if (r.test(url)) {
          matching.push(item);
        }
      }

      if (!matching.length) {
        // Create a new filter.
        newFilter();
        setDomain();
        setSaved(false);
      } else {
        // Render existing filters.
        for (let item of matching) {
          newFilter(item);
        }
        setSaved(true);
      }
    });
  });
}

/** Sets the first filter element to a regex for the current page's domain. */
function setDomain() {
  const host = (new URL(url)).host;
  setFirst('https?://' + escape(host) + '(/.*)?');
}

/** Sets the first filter element to a regex for the current page. */
function setPage() {
  const rawUrl = url.replace(/^(https?)/, '');
  setFirst('https?' + escape(rawUrl));
}

/** Sets the first filter element to the given value. */
function setFirst(filter) {
  const inputEl = document.querySelector('.filter');
  inputEl.value = filter;
}

/** Sets the saved state and performs needed updates. */
function setSaved(s) {
  saved = s;
  const el = document.querySelector('.blacklist');
  if (saved) {
    el.classList.add('saved');
  } else {
    el.classList.remove('saved');
  }

  const deleteEls = document.querySelectorAll('.delete-button');
  for (let deleteEl of deleteEls) {
    deleteEl.disabled = !saved;
  }
}

/** Creates a new filter row with the given value. */
function newFilter(item) {
  const targetEl = document.querySelector('.filters');
  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  if (item) {
    inputEl.dataset.filterId = item.id;
    inputEl.value = item.filter;
  }
  inputEl.classList.add('filter');
  inputEl.addEventListener('input', checkMatch);

  const deleteEl = document.createElement('button');
  deleteEl.innerText = 'X';
  deleteEl.classList.add('delete-button');
  deleteEl.addEventListener('click', () => deleteFilter(inputEl));

  const containerEl = document.createElement('div');
  containerEl.classList.add('filter-container');
  containerEl.appendChild(inputEl);
  containerEl.appendChild(deleteEl);
  targetEl.appendChild(containerEl);
}

function escape(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g,
                     '\\$&'); // $& is the matched string.
}

/** Checks that the filter matches the current URL. */
function checkMatch(e) {
  const filter = e.target.value;

  const r = new RegExp(filter);
  if (!r.test(url)) {
    e.target.classList.add('mismatch');
  } else {
    e.target.classList.remove('mismatch');
  }

  maybeDisableSave();
}

function maybeDisableSave() {
  // Check that there are no mismatches.
  const hasMismatch = document.querySelectorAll('.mismatch').length > 0;
  const noFilters = document.querySelectorAll('.filter').length === 0;
  const saveEl = document.querySelector('.save');
  saveEl.disabled = hasMismatch || noFilters;
}

/** Saves the currently defined filters. */
function saveFilters() {
  const mutates = [];
  const adds = [];

  const filters = document.querySelectorAll('.filter');
  for (let el of filters) {
    if (el.dataset.filterId !== undefined) {
      mutates.push({id : Number(el.dataset.filterId), filter : el.value});
    } else {
      maxId++;
      adds.push({id : maxId, filter : el.value});
    }
  }

  commit({deletes : [], adds : adds, mutates : mutates});
}

/** Saves a set of filter operations. */
function commit(operations) {
  chrome.storage.sync.get('blacklist', (res) => {
    const blacklist = res['blacklist'] || [];

    for (let deleteId of operations.deletes) {
      let i = blacklist.length;
      // Iterate in reverse so as to not break when splicing.
      while (i--) {
        if (blacklist[i].id === deleteId) {
          blacklist.splice(i, 1);
        }
      }
    }

    for (let mutate of operations.mutates) {
      for (let item of blacklist) {
        if (mutate.id === item.id) {
          item.filter = mutate.filter;
        }
      }
    }

    blacklist.push(...operations.adds);

    chrome.storage.sync.set({'blacklist' : blacklist}, () => {
      setSaved(true);
      maybeDisableSave();
      updateContentScript(blacklist);
    });
  });
}

/** Deletes the filter record of the given input element. */
function deleteFilter(inputEl) {
  const deleteIds = [ Number(inputEl.dataset.filterId) ];
  inputEl.parentNode.remove();
  commit({deletes : deleteIds, adds : [], mutates : []});
}

function updateContentScript(blacklist) {
  let disable = false;
  for (let item of blacklist) {
    const r = new RegExp(item.filter);
    if (r.test(url)) {
      disable = true;
      break;
    }
  }

  // Inform the content script whether or not it should be disabled.
  chrome.tabs.sendMessage(tabId, {disable : disable});
}

init();
})();
