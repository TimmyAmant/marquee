// Fills a template's tagged fields from the slate. The templates mark:
//   data-field="x"        text (or an input's value) from data.fields.x
//   data-list="x"         a list: its first child is cloned per data.lists.x item,
//                         and inside it data-bind / data-bind-alt / data-bind-title
//                         read the item's properties; img[data-slot] takes item.img
//   img[data-slot="x"]    outside lists, the image data.slots.x
//   data-bind-alt="x"     outside lists, alt text from data.fields.x

/** Node side: the data every title-page template shares. */
export function titlePageData(slate, viewer, images, theme) {
  return {
    theme,
    fields: {
      title: slate.title,
      meta: [slate.runtime, slate.genres.join(', '), slate.year].join(' · '),
      tagline: slate.tagline,
      overview: slate.overview,
      score: `★ ${slate.score}%`,
      'file-path': slate.file.path,
      'viewer-name': viewer.name,
      'viewer-host': viewer.host,
      'viewer-initials': viewer.name.split(/\s+/).slice(0, 2).map((word) => word[0].toUpperCase()).join(''),
    },
    lists: {
      credits: slate.credits,
      keywords: slate.keywords.map((text) => ({ text })),
      cast: slate.cast.map((member, i) => ({ ...member, img: images.cast[i] })),
      facts: [
        { label: 'Status', value: slate.status },
        { label: 'Release Date', value: slate.releaseDate },
        { label: 'Original Language', value: slate.originalLanguage },
        { label: 'Production Country', value: `${slate.productionCountry.flag} ${slate.productionCountry.name}` },
      ],
      providers: slate.providers.map((name, i) => ({ name, img: images.providers[i] })),
      'file-cells': slate.file.cells.map(([label, value]) => ({ label, value })),
    },
    slots: { backdrop: images.backdrop, poster: images.poster },
  };
}

/** Browser side (page.evaluate): must stay self-contained. */
export function fillPage(data) {
  const setText = (el, value) => {
    if (el.tagName === 'INPUT') {
      el.value = value;
      el.setAttribute('value', value);
    } else {
      el.textContent = value;
    }
  };
  for (const [field, value] of Object.entries(data.fields || {})) {
    document.querySelectorAll(`[data-field="${field}"]`).forEach((el) => setText(el, value));
  }
  for (const [name, items] of Object.entries(data.lists || {})) {
    document.querySelectorAll(`[data-list="${name}"]`).forEach((list) => {
      const template = list.firstElementChild;
      if (!template) return;
      const clones = items.map((item) => {
        const el = template.cloneNode(true);
        for (const node of [el, ...el.querySelectorAll('*')]) {
          const { bind, bindAlt, bindTitle, slot } = node.dataset;
          if (bind && item[bind] != null) setText(node, item[bind]);
          if (bindAlt && item[bindAlt] != null) node.setAttribute('alt', item[bindAlt]);
          if (bindTitle && item[bindTitle] != null) node.setAttribute('title', item[bindTitle]);
          if (slot && item.img) node.setAttribute('src', item.img);
        }
        return el;
      });
      list.replaceChildren(...clones);
    });
  }
  for (const [slot, url] of Object.entries(data.slots || {})) {
    document.querySelectorAll(`img[data-slot="${slot}"]`).forEach((img) => {
      if (!img.closest('[data-list]') && url) img.setAttribute('src', url);
    });
  }
  document.querySelectorAll('[data-bind-alt]').forEach((el) => {
    const value = data.fields?.[el.dataset.bindAlt];
    if (!el.closest('[data-list]') && value != null) el.setAttribute('alt', value);
  });
  if (data.theme) document.documentElement.setAttribute('data-theme', data.theme);
}
