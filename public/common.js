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

// About-me dock pinned to the bottom of every page.
const DOCK_LINKS = [
  { label: 'GitHub', href: 'https://github.com/bill-amanjha', icon: '<path fill="currentColor" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/>' },
  { label: 'X', href: 'https://x.com/_amnjha', icon: '<path fill="currentColor" d="M18.9 1.2h3.7l-8 9.1L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9ZM17.6 20.6h2L6.5 3.2H4.3Z"/>' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/amanjha01/', icon: '<path fill="currentColor" d="M20.4 20.5h-3.5v-5.6c0-1.3 0-3-1.9-3s-2.1 1.4-2.1 2.9v5.7H9.4V9h3.4v1.6c.5-.9 1.6-1.9 3.4-1.9 3.6 0 4.3 2.4 4.3 5.5v6.3zM5.3 7.4a2 2 0 1 1 0-4.1 2 2 0 0 1 0 4.1zm1.8 13.1H3.6V9h3.5v11.5zM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0z"/>' },
  { label: 'Website', href: 'https://amanjha.me', icon: '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c2.8 3 2.8 17 0 20M12 2c-2.8 3-2.8 17 0 20"/></g>' },
];

function mountDock() {
  const dock = el('nav', { class: 'dock', 'aria-label': 'About the maker' }, [
    el('a', { class: 'dock-me', href: 'https://amanjha.me', target: '_blank', rel: 'noopener' }, [
      el('img', { src: 'https://github.com/bill-amanjha.png?size=80', alt: '' }),
      el('span', {}, [el('small', { text: 'Made by' }), el('b', { text: 'Aman Jha' })]),
    ]),
    el('span', { class: 'dock-sep' }),
  ]);
  for (const l of DOCK_LINKS) {
    const a = el('a', { class: 'dock-item', href: l.href, target: '_blank', rel: 'noopener', 'aria-label': l.label, 'data-label': l.label });
    a.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${l.icon}</svg>`;
    dock.append(a);
  }
  document.body.append(dock);
}

document.addEventListener('DOMContentLoaded', mountDock);
