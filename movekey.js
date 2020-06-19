(function() {

/** Debounces a fn with a given timeout. */
function debounce(fn, timeout) {
  let id = null;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), timeout);
  };
}

/** Return the target of an event. */
function eventTarget(event) {
  return event ? event.target : document.activeElement;
}

/**
 * Returns whether or not the given target is an editable element.
 * Taken from vimium.
 */
function isEditable(element) {
  return element && !element.disabled &&
         (element.localName === 'textarea' || element.localName === 'select' ||
          element.isContentEditable ||
          element.matches('div.CodeMirror-scroll,div.ace_content') ||
          (element.localName === 'input' &&
           /^(?!button|checkbox|file|hidden|image|radio|reset|submit)/i.test(
               element.type)));
}

/** XPath functions. Taken from vimium. */
function makeXPath(elementArray) {
  const xpath = [];
  for (let element of elementArray) {
    xpath.push(".//" + element, ".//xhtml:" + element);
  }
  return xpath.join(" | ");
}

function evaluateXPath(xpath, resultType) {
  const contextNode = document.webkitIsFullScreen
                          ? document.webkitFullscreenElement
                          : document.documentElement;
  const namespaceResolver = (namespace) =>
      namespace === "xhtml" ? "http://www.w3.org/1999/xhtml" : null;
  return document.evaluate(xpath, contextNode, namespaceResolver, resultType,
                           null);
}

function textInputXPath() {
  const textInputTypes =
      [ 'text', 'search', 'email', 'url', 'number', 'password', 'date', 'tel' ];
  const inputElements = [
    'input[(' +
        textInputTypes.map(type => '@type="' + type + '"').join(' or ') +
        ' or not(@type))' +
        ' and not(@disabled or @readonly)]',
    'textarea',
    "*[@contenteditable='' or translate(@contenteditable, 'TRUE', 'true')='true']",
  ];
  return makeXPath(inputElements);
}

/** Focuses the first input on the page. */
function focusInput() {
  const results =
      evaluateXPath(textInputXPath(), XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
  const visible = [];
  for (let i = 0; i < results.snapshotLength; i++) {
    let elem = results.snapshotItem(i);
    if (hasVisibleClientRect(elem)) {
      visible.push({
        elem,
        index : i,
      });
    }
  }

  visible.sort(({elem : elem1, index : i1}, {elem : elem2, index : i2}) => {
    if (elem1.tabIndex > 0) {
      if (elem2.tabIndex > 0) {
        let diff = elem1.tabIndex - elem2.tabIndex;
        if (diff !== 0) {
          return diff;
        } else {
          return i1 - i2;
        }
      }
      return -1;
    } else if (elem2.tabIndex > 0) {
      return 1;
    }
    return i1 - i2;
  });

  if (visible.length === 0) {
    return;
  }

  const target = visible[0].elem;

  target.focus();
  target.select();
}

function hasVisibleClientRect(element) {
  for (let clientRect of element.getClientRects()) {
    if (Math.max(clientRect.top, 0) >= (window.innerHeight - 4) ||
        Math.max(clientRect.left, 0) >= (window.innerWidth - 4)) {
      continue;
    }
    if (clientRect.right - clientRect.left < 3 ||
        clientRect.bottom - clientRect.top < 3) {
      continue;
    }

    // Eliminate invisible elements.
    const computedStyle = window.getComputedStyle(element, null);
    if (computedStyle.getPropertyValue('visibility') !== 'visible') {
      continue;
    }

    return true;
  }

  return false;
}

/** Scrolls the page by a given vertical offset. */
function scrollBy(yoffset) {
  window.scrollBy({
    top : yoffset,
    left : 0,
    // TODO: Determine a better smoothing system that doesn't break "holding
    // down" the key.
    // behavior : 'smooth',
  });
}

/** Scrolls the page to a given vertical offset. */
function scrollTo(yoffset) {
  window.scrollTo({
    top : yoffset,
    left : 0,
    // behavior : 'smooth',
  });
}

const SLIGHT_SCROLL = 60;
const FULL_SCROLL = 500;
const KEY_TIMEOUT_MS = 2000;

// Keep track of the last key.
let lastKey = null;
function setLastKey(key) {
  lastKey = key;
  scheduleReset();
}
const scheduleReset = debounce(() => { lastKey = null; }, KEY_TIMEOUT_MS);

/** Returns whether the current event should be ignored. */
function shouldIgnore(event) {
  return isEditable(eventTarget(event)) || hasModifiers(event);
}

function hasModifiers(event) {
  return event.altKey || event.ctrlKey || event.metaKey || event.isComposing;
}

/** Handles keydown for movekey. */
function keydown(event) {
  if (shouldIgnore(event)) {
    return;
  }

  switch (event.key) {
  case 'j':
    scrollBy(SLIGHT_SCROLL);
    break;
  case 'k':
    scrollBy(-SLIGHT_SCROLL);
    break;
  case 'd':
    scrollBy(FULL_SCROLL);
    break;
  case 'u':
    scrollBy(-FULL_SCROLL);
    break;
  case 'g':
    if (lastKey === 'g') {
      scrollTo(0);
    }
    break;
  case 'G':
    scrollTo(document.body.scrollHeight);
    break;
  case 'H':
    chrome.runtime.sendMessage({event : 'back'});
    break;
  case 'L':
    chrome.runtime.sendMessage({event : 'forward'});
    break;
  case 'y':
    if (lastKey === 'y') {
      chrome.runtime.sendMessage({event : 'duplicate'});
    }
    break;
  case 'i':
    focusInput();
    break;
  default:
    // Nothing to do.
    return
  }

  setLastKey(event.key);

  event.stopPropagation();
  event.preventDefault();
}

/** Whether or not the extensions is currently listening for keystrokes. */
let listening = false;

/** Starts movekey. */
function movekey() {
  // Initial query for disablelist.
  chrome.storage.sync.get('disablelist', (res) => {
    const disablelist = res['disablelist'] || [];
    for (let item of disablelist) {
      const r = new RegExp(item.filter);
      if (r.test(location.href)) {
        // Disabled; don't add the listener.
        return;
      }
    }
    // If we make it this far, then the page hasn't been disabled.
    setListening(true);
  });

  // Set up listener for updates.
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if ('disable' in req) {
      setListening(!req.disable);
    }
  });
}

/** Sets the listening states and registers event handlers. */
function setListening(listen) {
  // Check whether we need to do anything.
  if (listen !== listening) {
    if (listen) {
      document.addEventListener('keydown', keydown, /* capture */ true);
    } else {
      document.removeEventListener('keydown', keydown, /* capture */ true);
    }
    listening = listen;
  }
}

movekey();
})();
