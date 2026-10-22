// Helpers shared by the player and the guest page.

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

function trackRow(item, { sub, actions = [] } = {}) {
  return el('div', { class: 'track' }, [
    el('img', { src: item.thumb || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`, alt: '', loading: 'lazy' }),
    el('div', { class: 'meta' }, [
      el('div', { class: 'title', text: item.title }),
      el('div', { class: 'sub', text: sub ?? [item.author, item.addedBy && `added by ${item.addedBy}`].filter(Boolean).join(' · ') }),
    ]),
    actions.length ? el('div', { class: 'actions' }, actions) : null,
  ]);
}

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// Live state over Server-Sent Events; the browser reconnects on its own if the server restarts.
function subscribe(onState, onStatus) {
  const es = new EventSource('/api/events');
  es.onmessage = e => onState(JSON.parse(e.data));
  es.onopen = () => onStatus && onStatus(true);
  es.onerror = () => onStatus && onStatus(false);
  return es;
}

let toastTimer;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) document.body.append(t = el('div', { class: 'toast' }));
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function looksLikeLink(s) {
  return /youtu\.?be|^[\w-]{11}$/.test(s.trim());
}
