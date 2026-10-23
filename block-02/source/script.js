(() => {
  "use strict";
  const data = window.PORTFOLIO_DATA;
  if (!data) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const memberName = (member, index = data.members.indexOf(member)) => member.name.trim() || `Thành viên ${String(index + 1).padStart(2, "0")}`;
  const tags = items => `<div class="tags">${items.map(item => `<span class="tag">${escape(item)}</span>`).join("")}</div>`;
  function safeUrl(value, {local = false} = {}) {
    if (!value || !String(value).trim()) return "";
    const raw = String(value).trim();
    if (/^https?:\/\//i.test(raw)) {
      try { const url = new URL(raw); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
    }
    if (local && !/^[a-z][a-z\d+.-]*:/i.test(raw) && !raw.startsWith("//") && !raw.startsWith("#")) return raw;
    return "";
  }
  const emailUrl = value => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) ? `mailto:${encodeURIComponent(value)}` : "";
  function externalLink(label, value, local = false) {
    const url = safeUrl(value, {local});
    return url ? `<a class="button" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : "";
  }
  document.querySelectorAll("[data-team-name]").forEach(node => { node.textContent = data.team.name || "TRIAD"; });
  document.title = `${data.team.name || "TRIAD"} — Portfolio nhóm`;
  $("#current-year").textContent = String(new Date().getFullYear());

  $("#team-grid").innerHTML = data.members.map((member, index) => {
    const photo = safeUrl(member.photo, {local:true});
    return `<article class="member-card"><div class="member-portrait">${photo ? `<img src="${escape(photo)}" alt="Ảnh ${escape(memberName(member,index))}" loading="lazy">` : `<span class="member-number" aria-hidden="true">${String(index+1).padStart(2,"0")}</span><span class="portrait-label">ẢNH ĐẠI DIỆN</span>`}</div><div class="member-body"><div class="member-meta"><span>THÀNH VIÊN ${String(index+1).padStart(2,"0")}</span>${member.studentId ? `<span>${escape(member.studentId)}</span>` : ""}</div><h3>${escape(member.name || "[Họ và tên]")}</h3><p class="member-role">${escape(member.role)}</p><p class="member-bio">${escape(member.bio)}</p>${tags(member.skills)}<button class="button member-button" type="button" data-member="${escape(member.id)}" aria-label="Xem hồ sơ ${escape(memberName(member,index))}">Xem hồ sơ</button></div></article>`;
  }).join("");
  $("#skills-grid").innerHTML = data.skillGroups.map(group => `<article class="skill-group"><h3>${escape(group.title)}</h3><p>${escape(group.description)}</p>${tags(group.skills)}</article>`).join("");

  const previews = {
    tasks: `<div class="mini-window"><div class="mini-bar"><i></i><i></i><i></i><span>FlowTask</span></div><div class="mini-content"><div class="mini-title">Website nhóm <span class="mini-chip">Sprint 01</span></div><div class="mini-columns"><div class="mini-column"><strong>Cần làm</strong><div class="mini-task">Trang liên hệ<small>TV 01</small></div></div><div class="mini-column"><strong>Đang làm</strong><div class="mini-task">API dự án<small>TV 02</small></div><div class="mini-task">Kiểm tra API<small>TV 03</small></div></div><div class="mini-column"><strong>Hoàn thành</strong><div class="mini-task">Thiết kế dữ liệu<small>TV 02</small></div></div></div></div></div>`,
    library: `<div class="mini-window"><div class="mini-bar"><i></i><i></i><i></i><span>Campus Library</span></div><div class="mini-content"><div class="mini-title">Danh mục sách <span class="mini-chip">Tra cứu</span></div><div class="mini-table-row"><strong>Tài liệu</strong><strong>Tình trạng</strong></div><div class="mini-table-row"><span>Nhập môn lập trình</span><span class="mini-good">Có sẵn</span></div><div class="mini-table-row"><span>Cơ sở dữ liệu</span><span>Đang mượn</span></div><div class="mini-table-row"><span>Kỹ thuật phần mềm</span><span class="mini-good">Có sẵn</span></div></div></div>`,
    commerce: `<div class="mini-window"><div class="mini-bar"><i></i><i></i><i></i><span>Mini Commerce</span></div><div class="mini-content"><div class="mini-title">Góc học tập <span class="mini-chip">Giỏ hàng (2)</span></div><div class="mini-catalog"><div class="mini-product"><div class="mini-product-image">SẢN PHẨM</div><span>Sổ tay</span><b>45.000 đ</b></div><div class="mini-product"><div class="mini-product-image">SẢN PHẨM</div><span>Bút viết</span><b>15.000 đ</b></div><div class="mini-product"><div class="mini-product-image">SẢN PHẨM</div><span>Túi vải</span><b>85.000 đ</b></div></div></div></div>`,
  };
  function renderProjects(filter = "all") {
    const projects = data.projects.filter(project => filter === "all" || project.category === filter);
    $("#project-grid").innerHTML = projects.map(project => `<article class="project-card"><div class="project-preview ${escape(project.preview)}" aria-hidden="true">${previews[project.preview] || ""}</div><div class="project-body"><div class="project-meta"><span>${escape(project.categoryLabel)}</span><span>${escape(project.year)}</span></div><h3>${escape(project.title)}</h3><p class="project-description">${escape(project.summary)}</p>${tags(project.stack)}<button class="project-open" type="button" data-project="${escape(project.id)}" aria-label="Xem chi tiết ${escape(project.title)}"><span>Xem câu chuyện dự án</span><span aria-hidden="true">+</span></button></div></article>`).join("");
    $("#filter-status").textContent = `Đang hiển thị ${projects.length} dự án.`;
    document.dispatchEvent(new CustomEvent("portfolio:projects-rendered"));
  }
  renderProjects();
  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach(peer => { const selected = peer === button; peer.classList.toggle("active", selected); peer.setAttribute("aria-pressed", String(selected)); });
    renderProjects(button.dataset.filter);
  }));

  const dialog = $("#detail-dialog");
  let lastFocused = null;
  function openDialog(label, content) {
    lastFocused = document.activeElement;
    $("#dialog-label").textContent = label;
    $("#dialog-content").innerHTML = `<div class="dialog-content-inner">${content}</div>`;
    dialog.showModal();
    dialog.scrollTop = 0;
    document.body.style.overflow = "hidden";
  }
  dialog.addEventListener("close", () => { document.body.style.overflow = ""; if (lastFocused?.isConnected) lastFocused.focus(); });
  $(".dialog-close",dialog).addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });

  function showMember(id) {
    const member = data.members.find(item => item.id === id);
    if (!member) return;
    const projects = data.projects.filter(project => project.contributions.some(item => item.memberId === member.id));
    const contact = emailUrl(member.email);
    const links = [contact ? `<a class="button button-dark" href="${escape(contact)}">Gửi email</a>` : "", externalLink("GitHub",member.github),externalLink("LinkedIn",member.linkedin),externalLink("CV cá nhân",member.cv,true)].join("");
    const personalFields = [["Họ và tên",member.name],["Mã số sinh viên",member.studentId],["Trường",member.school],["Ngành học",member.major],["Email",member.email]];
    openDialog("HỒ SƠ THÀNH VIÊN", `<h2 id="dialog-title">${escape(memberName(member))}</h2><p class="member-role">${escape(member.role)}</p><p class="dialog-lead">${escape(member.introduction)}</p><dl class="dialog-meta">${personalFields.map(([label,value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value || "—")}</dd></div>`).join("")}</dl><section class="dialog-block"><h3>Kỹ năng</h3>${tags(member.skills)}</section><section class="dialog-block"><h3>Hướng chuyên môn</h3><ul>${member.focus.map(item => `<li>${escape(item)}</li>`).join("")}</ul></section><section class="dialog-block"><h3>Dự án & đóng góp</h3><div class="contribution-list">${projects.map(project => {const contribution = project.contributions.find(item => item.memberId === member.id);return `<div class="contribution-item"><strong>${escape(project.title)}${project.sample ? " · mẫu" : ""}</strong><p>${escape(contribution.work)}</p></div>`;}).join("") || "<p>Chưa bổ sung dự án.</p>"}</div></section>${member.achievements.length ? `<section class="dialog-block"><h3>Hoạt động & thành tích</h3><ul>${member.achievements.map(item => `<li>${escape(item)}</li>`).join("")}</ul></section>` : ""}${links ? `<div class="dialog-actions">${links}</div>` : `<p class="dialog-note">Chưa bổ sung thông tin liên hệ.</p>`}`);
  }
  function showProject(id) {
    const project = data.projects.find(item => item.id === id);
    if (!project) return;
    const links = externalLink("Xem demo",project.demo) + externalLink("Mã nguồn GitHub",project.github);
    openDialog(project.sample ? "DỰ ÁN MINH HỌA" : "CHI TIẾT DỰ ÁN", `<h2 id="dialog-title">${escape(project.title)}</h2><p class="dialog-lead">${escape(project.summary)}</p>${tags(project.stack)}<section class="dialog-block"><h3>Bài toán</h3><p>${escape(project.problem)}</p></section><section class="dialog-block"><h3>Chức năng chính</h3><ul>${project.features.map(item => `<li>${escape(item)}</li>`).join("")}</ul></section><section class="dialog-block"><h3>Phân chia đóng góp${project.sample ? " dự kiến" : ""}</h3><div class="contribution-list">${project.contributions.map(item => { const member = data.members.find(person => person.id === item.memberId); return `<div class="contribution-item"><strong>${escape(member ? memberName(member) : "Thành viên")}</strong><p>${escape(item.work)}</p></div>`; }).join("")}</div></section><section class="dialog-block"><h3>${project.sample ? "Nội dung có thể học được" : "Bài học từ dự án"}</h3><p>${escape(project.learning)}</p></section><p class="dialog-note">${escape(project.status)}</p>${links ? `<div class="dialog-actions">${links}</div>` : ""}`);
  }
  document.addEventListener("click", event => {
    const memberButton = event.target.closest("[data-member]");
    const projectButton = event.target.closest("[data-project]");
    if (memberButton) showMember(memberButton.dataset.member);
    if (projectButton) showProject(projectButton.dataset.project);
  });

  const teamEmail = emailUrl(data.team.email);
  $("#team-email").innerHTML = teamEmail ? `<a class="contact-email" href="${escape(teamEmail)}">${escape(data.team.email)}</a>` : `<p class="contact-placeholder">[Email liên hệ của nhóm]</p>`;
  const teamGithub = safeUrl(data.team.github);
  if (teamGithub) $("#team-email").insertAdjacentHTML("beforeend", `<p><a class="text-link" href="${escape(teamGithub)}" target="_blank" rel="noopener noreferrer">GitHub của nhóm</a></p>`);
  $("#contact-members").innerHTML = data.members.map(member => `<button class="contact-member" type="button" data-member="${escape(member.id)}">${escape(memberName(member))}</button>`).join("");

  const menuToggle = $(".menu-toggle");
  const nav = $("#main-nav");
  const setMenu = open => { menuToggle.setAttribute("aria-expanded",String(open));nav.classList.toggle("is-open",open); };
  menuToggle.addEventListener("click", () => setMenu(menuToggle.getAttribute("aria-expanded") !== "true"));
  nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", event => { if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {setMenu(false);menuToggle.focus();} });
  document.addEventListener("click", event => { if (!event.target.closest(".site-header")) setMenu(false); });
})();
