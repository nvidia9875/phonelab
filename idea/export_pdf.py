"""Render every artboard in canvas.json with headless Chrome and bind them into
one PDF (one page per artboard, in canvas order).

Run from this directory:
    python3 export_pdf.py            # -> phonelab-idea-sheet.pdf

Requires Google Chrome at the default macOS path and PyMuPDF (fitz) on the
system Python. Pages are rasterised at 2x; text is not selectable.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile

import fitz

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT_PDF = "phonelab-idea-sheet.pdf"


def main() -> None:
    canvas = json.load(open("canvas.json", encoding="utf-8"))
    tmp = tempfile.mkdtemp(prefix="phonelab-pdf-")
    doc = fitz.open()
    toc = []
    for i, board in enumerate(canvas["artboards"], start=1):
        src = board["file"]
        w, h = board["w"], board["h"]
        png = os.path.join(tmp, src.replace(".dc.html", ".png"))
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--force-device-scale-factor=2", f"--window-size={w},{h}",
             "--virtual-time-budget=8000", f"--screenshot={png}",
             "file://" + os.path.abspath(src)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
        )
        if not os.path.exists(png):
            raise SystemExit(f"screenshot failed for {src}")
        page = doc.new_page(width=w * 0.75, height=h * 0.75)
        page.insert_image(page.rect, filename=png)
        toc.append([1, board.get("title", src), i])
    doc.set_toc(toc)
    doc.set_metadata({"title": "PhoneLab アイデアシート",
                      "subject": "第5回 Agentic AI Hackathon with Google Cloud 提案 PhoneLab"})
    doc.save(OUT_PDF, garbage=3, deflate=True)
    print(f"wrote {OUT_PDF}: {len(doc)} pages, {os.path.getsize(OUT_PDF) // 1024} KB")


if __name__ == "__main__":
    main()
