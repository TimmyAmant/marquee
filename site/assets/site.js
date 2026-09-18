/* Marquee landing page: the bulb border, scroll reveals and the copy
   button. Everything degrades to a static page. */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---- marquee bulbs ------------------------------------------------------
     Bulbs sit on a rounded rectangle through the middle of the sign's border,
     evenly spaced, and power up once from the top centre outwards. */
  const sign = document.querySelector('[data-bulbs]');
  if (sign) {
    const layer = sign.querySelector('.bulbs');
    let lastSize = '';

    const build = () => {
      const w = sign.clientWidth;
      const h = sign.clientHeight;
      const size = `${w}x${h}`;
      if (!w || !h || size === lastSize) return;
      lastSize = size;

      const style = getComputedStyle(sign);
      const inset = parseFloat(style.paddingLeft) / 2;
      const spacing = parseFloat(style.getPropertyValue('--spacing')) || 22;
      const W = w - inset * 2;
      const H = h - inset * 2;
      const r = Math.min(Math.max(0, parseFloat(style.borderTopLeftRadius) - inset), W / 2, H / 2);
      const sx = W - 2 * r;           // straight runs
      const sy = H - 2 * r;
      const arc = (Math.PI * r) / 2;

      // clockwise from the top centre
      const L = inset, T = inset, R = inset + W, B = inset + H;
      const corner = (cx, cy, from) => (t) => {
        const a = from + (t * Math.PI) / 2;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      };
      const segs = [
        [sx / 2, (t) => [L + W / 2 + t * (sx / 2), T]],
        [arc, corner(R - r, T + r, -Math.PI / 2)],
        [sy, (t) => [R, T + r + t * sy]],
        [arc, corner(R - r, B - r, 0)],
        [sx, (t) => [R - r - t * sx, B]],
        [arc, corner(L + r, B - r, Math.PI / 2)],
        [sy, (t) => [L, B - r - t * sy]],
        [arc, corner(L + r, T + r, Math.PI)],
        [sx / 2, (t) => [L + r + t * (sx / 2), T]],
      ];
      const perimeter = segs.reduce((sum, [len]) => sum + len, 0);
      const count = Math.max(12, Math.round(perimeter / spacing));
      const step = perimeter / count;

      const pointAt = (s) => {
        for (const [len, fn] of segs) {
          if (len > 0 && s <= len) return fn(s / len);
          s -= len;
        }
        return segs[0][1](0);
      };

      const frag = document.createDocumentFragment();
      for (let i = 0; i < count; i++) {
        const s = i * step;
        const [x, y] = pointAt(s);
        const bulb = document.createElement('i');
        bulb.className = 'bulb';
        bulb.style.left = `${x.toFixed(1)}px`;
        bulb.style.top = `${y.toFixed(1)}px`;
        // 0 at the top centre, 1 at the bottom centre: both halves light together
        bulb.style.setProperty('--d', (Math.min(s, perimeter - s) / (perimeter / 2)).toFixed(3));
        frag.appendChild(bulb);
      }
      layer.replaceChildren(frag);
    };

    build();
    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(build);
    }).observe(sign);

    if (reduceMotion.matches) {
      layer.classList.add('is-lit');
    } else {
      // Power up once, a beat after first paint, then leave the sign lit.
      setTimeout(() => {
        layer.classList.add('is-chasing', 'is-lit');
        setTimeout(() => layer.classList.remove('is-chasing'), 2400);
      }, 150);
    }
  }

  /* ---- scroll reveal ------------------------------------------------------ */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  /* ---- copy ---------------------------------------------------------------- */
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
      return ok;
    }
  };

  document.querySelectorAll('[data-copy-target]').forEach((button) => {
    const source = document.getElementById(button.dataset.copyTarget);
    const label = button.querySelector('.copy-label');
    const status = document.createElement('span');
    status.className = 'visually-hidden';
    status.setAttribute('role', 'status');
    button.after(status);
    let timer = 0;

    button.addEventListener('click', async () => {
      const clone = source.cloneNode(true);
      clone.querySelectorAll('.c-prompt').forEach((n) => n.remove());
      const text = `${clone.textContent.trim()}\n`;
      const ok = await copyText(text);
      if (!ok) {
        // Clipboard blocked: select the commands so ⌘C / Ctrl+C works.
        const range = document.createRange();
        range.selectNodeContents(source);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      label.textContent = ok ? 'Copied' : 'Selected';
      status.textContent = ok ? 'Commands copied to the clipboard' : 'Commands selected, press Command or Control C to copy';
      button.classList.toggle('is-copied', ok);
      clearTimeout(timer);
      timer = setTimeout(() => {
        label.textContent = 'Copy';
        button.classList.remove('is-copied');
        status.textContent = '';
      }, 2200);
    });
  });
})();
