const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

document.getElementById('year').textContent = new Date().getFullYear();

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

// ---------- Lite YouTube (loads the player only on click) ----------
document.querySelectorAll('.video[data-yt]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.yt;
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    iframe.title = btn.getAttribute('aria-label');
    iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    btn.replaceChildren(iframe);
    btn.removeAttribute('aria-label');
  }, { once: true });
});

// ---------- Accordion: one open at a time, animated height ----------
document.querySelectorAll('.acc').forEach((acc) => {
  const summary = acc.querySelector('summary');
  const body = acc.querySelector('.acc__body');
  summary.addEventListener('click', (e) => {
    if (reduced || !hasGsap) return;
    e.preventDefault();
    if (acc.open) {
      gsap.to(body, { height: 0, duration: 0.45, ease: 'power3.inOut', onComplete: () => { acc.open = false; body.style.height = ''; } });
    } else {
      document.querySelectorAll('.acc[open]').forEach((o) => o !== acc && o.querySelector('summary').click());
      acc.open = true;
      gsap.fromTo(body, { height: 0 }, { height: 'auto', duration: 0.55, ease: 'power3.out' });
    }
  });
});

// ---------- WebGL scenes ----------
const gl = webglOK();
if (!gl) document.documentElement.classList.add('no-webgl');

let heroState = null;
let court = null;

async function initScenes() {
  if (!gl) return;
  try { await document.fonts.load('100px Anton'); } catch {}
  const [{ initHero }, { initCourt }, { initCommunity }] = await Promise.all([
    import('./scene-hero.js'), import('./scene-court.js'), import('./scene-community.js'),
  ]);
  try { heroState = initHero(document.getElementById('hero-canvas'), { reduced }); } catch (e) { console.error(e); }
  try {
    court = initCourt(document.getElementById('court-canvas'), { reduced });
    const badge = document.getElementById('serve-side');
    court.hud.onServeSide = (side) => {
      badge.textContent = side === 'even' ? 'Score even: serve from the right' : 'Score odd: serve from the left';
    };
  } catch (e) { console.error(e); document.documentElement.classList.add('no-webgl'); }
  try { initCommunity(document.getElementById('community-canvas'), { reduced }); } catch (e) { console.error(e); }
}

// ---------- Rules stepper (shared by scroll and fallback) ----------
const ruleEls = [...document.querySelectorAll('.rule')];
const tickEls = [...document.querySelectorAll('.rules__ticks span')];
let activeRule = 0;
let scoreTween = null;
function setRule(i) {
  if (i === activeRule) return;
  activeRule = i;
  ruleEls.forEach((el, n) => el.classList.toggle('is-active', n === i));
  tickEls.forEach((el, n) => el.classList.toggle('is-active', n === i));
  court?.setStep(i);
  if (i === 4) {
    const a = document.getElementById('score-a'), b = document.getElementById('score-b');
    if (reduced || !hasGsap) { a.textContent = 11; b.textContent = 9; return; }
    const s = { a: 0, b: 0 };
    scoreTween?.kill();
    scoreTween = gsap.to(s, {
      a: 11, b: 9, duration: 2.2, ease: 'power2.out',
      onUpdate: () => { a.textContent = Math.round(s.a); b.textContent = Math.round(s.b); },
    });
  }
}

// ---------- Motion ----------
function initMotion() {
  gsap.registerPlugin(ScrollTrigger);

  // Smooth scroll
  let lenis = null;
  if (!reduced && typeof window.Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: 0, duration: 1.4 });
      });
    });
  }

  // Nav hides on scroll down, returns on scroll up
  const nav = document.getElementById('nav');
  ScrollTrigger.create({
    start: 120, end: 'max',
    onUpdate: (self) => nav.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > 400),
  });

  if (reduced) {
    // Rules still step through on scroll, just without transitions
    ScrollTrigger.create({
      trigger: '#rules', start: 'top top', end: '+=300%', pin: '.rules__pin',
      onUpdate: (self) => setRule(Math.min(4, Math.floor(self.progress * 5))),
    });
    return;
  }

  // Hero intro: headline lines rise, then supporting copy
  const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
  intro.from('.hero__title .line > span', { yPercent: 110, duration: 1.3, stagger: 0.12 }, 0.15)
    .from('.hero .reveal-up', { y: 24, opacity: 0, duration: 1, stagger: 0.1 }, 0.45);

  // Hero exit: 3D rig turns away and the copy lifts as you scroll on
  ScrollTrigger.create({
    trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true,
    onUpdate: (self) => { if (heroState) heroState.exit = self.progress; },
  });
  gsap.to('.hero__inner', { yPercent: -18, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  // Marquee leans with scroll velocity
  const marquee = document.querySelector('.marquee__track');
  ScrollTrigger.create({
    trigger: '.marquee', start: 'top bottom', end: 'bottom top',
    onUpdate: (self) => gsap.to(marquee, { skewX: gsap.utils.clamp(-10, 10, self.getVelocity() / -250), duration: 0.4, overwrite: true }),
  });

  // Kinetic lede: words light up as you read down the page
  const lede = document.querySelector('[data-kinetic]');
  if (lede) {
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part.trim()) { frag.append(part); return; }
            const s = document.createElement('span');
            s.className = 'w';
            s.textContent = part;
            frag.append(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(lede);
    gsap.to(lede.querySelectorAll('.w'), {
      opacity: 1, stagger: 0.05, ease: 'none',
      scrollTrigger: { trigger: lede, start: 'top 80%', end: 'bottom 45%', scrub: true },
    });
  }

  // Generic reveals (hero handled above)
  gsap.utils.toArray('.reveal-up').forEach((el) => {
    if (el.closest('.hero')) return;
    gsap.from(el, { y: 36, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
  });
  gsap.utils.toArray('.reveal-clip').forEach((el) => {
    gsap.fromTo(el, { clipPath: 'inset(18% 12% 18% 12% round 22px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 22px)', ease: 'none',
      scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 35%', scrub: true },
    });
    gsap.fromTo(el.querySelector('img'), { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // Community headline
  gsap.from('.community__title .line > span', {
    yPercent: 110, duration: 1.2, stagger: 0.12, ease: 'expo.out',
    scrollTrigger: { trigger: '.community', start: 'top 60%' },
  });

  // Price counters
  document.querySelectorAll('[data-count]').forEach((el) => {
    const end = +el.dataset.count;
    const o = { v: 0 };
    gsap.to(o, {
      v: end, duration: 1.6, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%' },
      onUpdate: () => { el.textContent = Math.round(o.v); },
    });
  });
  gsap.from('.bento__cell', {
    y: 60, opacity: 0, rotateX: 8, duration: 1.1, stagger: 0.12, ease: 'expo.out',
    scrollTrigger: { trigger: '.bento', start: 'top 80%' },
  });

  const mm = gsap.matchMedia();

  // Courts: vertical scroll drives a horizontal pan (desktop/tablet)
  mm.add('(min-width: 768px)', () => {
    const section = document.querySelector('.courts');
    const track = document.querySelector('.courts__track');
    const distance = () => track.scrollWidth - window.innerWidth;
    const pan = gsap.to(track, {
      x: () => -distance(), ease: 'none',
      scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 },
    });
    // images drift inside their frames for depth
    gsap.utils.toArray('.courts__img img').forEach((img) => {
      gsap.fromTo(img, { xPercent: -8 }, {
        xPercent: 0, ease: 'none',
        scrollTrigger: { trigger: img.parentElement, containerAnimation: pan, start: 'left right', end: 'right left', scrub: true },
      });
    });
    gsap.utils.toArray('.courts__media').forEach((fig) => {
      gsap.from(fig, {
        rotateY: -18, scale: 0.9, opacity: 0.4, transformPerspective: 1200, ease: 'none',
        scrollTrigger: { trigger: fig, containerAnimation: pan, start: 'left right', end: 'center center', scrub: true },
      });
    });
  });
  mm.add('(max-width: 767px)', () => {
    gsap.utils.toArray('.courts__panel').forEach((p) => {
      gsap.from(p, { y: 50, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: p, start: 'top 85%' } });
    });
  });

  // Rules: pin the court and step through each rule
  ScrollTrigger.create({
    trigger: '#rules', start: 'top top', end: '+=420%', pin: '.rules__pin', scrub: true, anticipatePin: 1,
    onUpdate: (self) => setRule(Math.min(4, Math.floor(self.progress * 5 * 0.999))),
  });

  // Tilt cards and magnetic buttons (mouse only)
  if (finePointer) {
    document.querySelectorAll('.tilt').forEach((card) => {
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' });
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 10);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
      });
      card.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
    document.querySelectorAll('.magnetic').forEach((btn) => {
      const x = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'elastic.out(1, 0.4)' });
      const y = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'elastic.out(1, 0.4)' });
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        x((e.clientX - r.left - r.width / 2) * 0.25);
        y((e.clientY - r.top - r.height / 2) * 0.35);
      });
      btn.addEventListener('pointerleave', () => { x(0); y(0); });
    });
  }

  window.addEventListener('load', () => ScrollTrigger.refresh());
}

if (hasGsap) initMotion();
else {
  // No GSAP: show every rule stacked so nothing is hidden
  document.querySelectorAll('.rule').forEach((r) => r.classList.add('is-active'));
}
initScenes();
