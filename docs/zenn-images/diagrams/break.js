// 説明の文を、意味の切れ目で改行する。「。」「、」のあとで、前後どちらも 6 文字以上あるときだけ。
// 導入（.lede）は「。」だけ。data-nobr を付けた要素は触らない（高さの決まった枠ではみ出すため）
(function () {
  const MIN = 6;
  document.querySelectorAll(".desc, .small, .lede").forEach((el) => {
    if (el.querySelector("br") || el.hasAttribute("data-nobr")) return; // 手で改行してあるもの・枠の決まったものはそのまま
    const periodsOnly = el.classList.contains("lede");
    el.childNodes.forEach((node) => {
      if (node.nodeType !== 3) return;
      const text = node.textContent;
      const out = [];
      let line = "";
      for (let i = 0; i < text.length; i++) {
        line += text[i];
        const rest = text.slice(i + 1).trim();
        const enough = line.length >= MIN && rest.replace(/[。、]/g, "").length >= MIN;
        const isEnd = text[i] === "。" && enough;
        const isComma = !periodsOnly && text[i] === "、" && enough;
        if (isEnd || isComma) {
          out.push(line);
          line = "";
        }
      }
      if (line) out.push(line);
      if (out.length < 2) return;
      const frag = document.createDocumentFragment();
      out.forEach((l, k) => {
        frag.appendChild(document.createTextNode(l));
        if (k < out.length - 1) frag.appendChild(document.createElement("br"));
      });
      node.replaceWith(frag);
    });
  });
})();
