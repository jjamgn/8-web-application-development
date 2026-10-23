/* Hiệu ứng trang trí bằng JavaScript thuần.
   Giảm chuyển động tự động theo cài đặt của thiết bị. */
(() => {
  "use strict";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const header = document.querySelector(".site-header");
  const hero = document.querySelector(".hero");
  const stack = document.querySelector(".hero-stack");
  let scrollScheduled = false;
  const updateHeader = () => { header.classList.toggle("is-scrolled",window.scrollY > 12); scrollScheduled = false; };
  updateHeader();
  window.addEventListener("scroll", () => { if (!scrollScheduled) { scrollScheduled = true; requestAnimationFrame(updateHeader); } }, {passive:true});

  // Nội dung luôn hiển thị nếu JavaScript hoặc IntersectionObserver không có.
  let revealObserver = null;
  if ("IntersectionObserver" in window) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); revealObserver.unobserve(entry.target); } });
    }, {threshold:0.08,rootMargin:"0px 0px -28px 0px"});
  }
  function mountReveals() {
    const targets = document.querySelectorAll(".section-heading,.about-grid>div,.member-card,.project-card,.skills-layout>div,.process-grid article,.contact-grid>div");
    targets.forEach((element,index) => {
      if (element.classList.contains("reveal")) return;
      element.classList.add("reveal");
      element.style.setProperty("--reveal-delay",`${(index % 3) * 65}ms`);
      if (!revealObserver || motion.matches) element.classList.add("is-visible");
      else revealObserver.observe(element);
    });
    document.body.classList.add("effects-ready");
  }
  mountReveals();
  document.addEventListener("portfolio:projects-rendered",mountReveals);
  document.addEventListener("focusin",event => {
    const element = event.target.closest(".reveal");
    if (element) element.classList.add("is-visible");
  });
  motion.addEventListener("change",() => {
    if (motion.matches) document.querySelectorAll(".reveal").forEach(element => element.classList.add("is-visible"));
  });

  // Ánh sáng trên thẻ; chỉ theo chuột ở thiết bị có con trỏ chính xác.
  document.addEventListener("pointermove",event => {
    if (!finePointer.matches || motion.matches) return;
    const card = event.target.closest(".member-card,.project-card");
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--spot-x",`${event.clientX - box.left}px`);
    card.style.setProperty("--spot-y",`${event.clientY - box.top}px`);
  }, {passive:true});
  let pointerFrame = 0;
  let pointer = {x:0,y:0};
  hero.addEventListener("pointermove",event => {
    if (!finePointer.matches || motion.matches) return;
    const box = hero.getBoundingClientRect();
    pointer = {x:Math.max(-1,Math.min(1,(event.clientX-box.left)/box.width*2-1)),y:Math.max(-1,Math.min(1,(event.clientY-box.top)/box.height*2-1))};
    if (!pointerFrame) pointerFrame = requestAnimationFrame(() => {
      hero.style.setProperty("--ambient-x",pointer.x.toFixed(3));
      hero.style.setProperty("--ambient-y",pointer.y.toFixed(3));
      stack.style.setProperty("--tilt-y",pointer.x.toFixed(3));
      stack.style.setProperty("--tilt-x",pointer.y.toFixed(3));
      pointerFrame = 0;
    });
  }, {passive:true});
  hero.addEventListener("pointerleave",() => {
    if (pointerFrame) {cancelAnimationFrame(pointerFrame);pointerFrame = 0;}
    ["--ambient-x","--ambient-y"].forEach(property => hero.style.setProperty(property,"0"));
    ["--tilt-x","--tilt-y"].forEach(property => stack.style.setProperty(property,"0"));
  });

  // Các điểm và đường nối là họa tiết trang trí, không phải dữ liệu.
  const canvas = document.querySelector(".hero-canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  let width = 0, height = 0, frame = 0, visible = true, lastFrame = 0;
  let dots = [];
  function sizeCanvas() {
    const box = hero.getBoundingClientRect();
    width = box.width; height = box.height;
    const ratio = Math.min(window.devicePixelRatio || 1,1.5);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio,0,0,ratio,0,0);
    const count = width < 650 ? 17 : 36;
    dots = Array.from({length:count},(_,index) => ({x:((index*0.61803398875+.11)%1)*width,y:((index*.41421356237+.16)%1)*height,phase:index*1.37}));
    draw(0);
  }
  function draw(time) {
    context.clearRect(0,0,width,height);
    const drift = motion.matches ? 0 : time * .00015;
    const points = dots.map(dot => ({x:dot.x+Math.sin(drift+dot.phase)*10,y:dot.y+Math.cos(drift*.8+dot.phase)*8}));
    points.forEach((point,index) => {
      for(let second=index+1;second<points.length;second++) {
        const peer = points[second]; const distance = Math.hypot(point.x-peer.x,point.y-peer.y);
        if (distance < 145) {
          context.strokeStyle = `rgba(141,205,217,${(1-distance/145)*.15})`;
          context.lineWidth = .6;
          context.beginPath(); context.moveTo(point.x,point.y);context.lineTo(peer.x,peer.y);context.stroke();
        }
      }
      context.fillStyle = "rgba(172,220,228,.42)";
      context.beginPath(); context.arc(point.x,point.y,index%5===0?1.5:1,0,Math.PI*2);context.fill();
    });
  }
  function animate(time) {
    if (!visible || document.hidden || motion.matches) {frame = 0;return;}
    if (time-lastFrame > 45) {draw(time);lastFrame = time;}
    frame = requestAnimationFrame(animate);
  }
  function syncAnimation() {
    if (frame) {cancelAnimationFrame(frame);frame = 0;}
    if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(animate);
    else draw(0);
  }
  sizeCanvas();
  if ("ResizeObserver" in window) new ResizeObserver(sizeCanvas).observe(hero);
  else window.addEventListener("resize",sizeCanvas,{passive:true});
  if ("IntersectionObserver" in window) new IntersectionObserver(entries => {visible = entries[0].isIntersecting;syncAnimation();},{threshold:0}).observe(hero);
  document.addEventListener("visibilitychange",syncAnimation);
  motion.addEventListener("change",syncAnimation);
  syncAnimation();
})();
