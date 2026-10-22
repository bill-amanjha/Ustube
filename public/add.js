// Search-or-paste box used on both pages. Paste a link to add it, or type words to search.
function mountAddBox(root, getName) {
  const input = el('input', { class: 'field', placeholder: 'Search a song or paste a YouTube link', autocomplete: 'off', enterkeyhint: 'search' });
  const go = el('button', { class: 'btn primary', text: 'Go' });
  const results = el('div', { class: 'results' });
  root.append(el('div', { class: 'row' }, [input, go]), results);

  async function add(payload, playNext) {
    try {
      const { item } = await api('/api/add', { ...payload, name: getName(), playNext });
      toast(playNext ? `Playing next: ${item.title}` : `Added: ${item.title}`);
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    }
  }

  async function submit() {
    const q = input.value.trim();
    if (!q) return;
    if (looksLikeLink(q)) {
      go.disabled = true;
      if (await add({ url: q })) input.value = '';
      go.disabled = false;
      return;
    }
    results.replaceChildren(el('div', { class: 'empty', text: 'Searching…' }));
    try {
      const { results: list } = await api(`/api/search?q=${encodeURIComponent(q)}`);
      if (!list.length) return results.replaceChildren(el('div', { class: 'empty', text: 'No results. Try pasting a YouTube link.' }));
      results.replaceChildren(...list.map(r => {
        const addBtn = el('button', { class: 'btn icon primary', text: '+ Add', title: 'Add to end of queue' });
        const nextBtn = el('button', { class: 'btn icon', text: 'Next', title: 'Play after current song' });
        const pick = async (playNext, btn) => {
          if (await add({ videoId: r.videoId, title: r.title, author: r.author }, playNext)) {
            btn.textContent = '✓';
            btn.disabled = true;
          }
        };
        addBtn.addEventListener('click', () => pick(false, addBtn));
        nextBtn.addEventListener('click', () => pick(true, nextBtn));
        return trackRow(r, { sub: [r.author, r.duration].filter(Boolean).join(' · '), actions: [nextBtn, addBtn] });
      }));
    } catch (e) {
      results.replaceChildren(el('div', { class: 'empty', text: e.message }));
    }
  }

  go.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  input.addEventListener('input', () => { if (!input.value) results.replaceChildren(); });
}
