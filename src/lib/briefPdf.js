// Export a page section (the signal drawer, the Profile page, ...) to PDF —
// an exact visual copy of what the reader sees online (same layout, colors,
// fonts, collapsed/expanded sections).
//
// The element is rendered with html2canvas and paginated onto US Letter pages
// with jsPDF. Controls are left out: every <button> inside the element, plus
// anything marked data-pdf-exclude. Both libraries are loaded on demand, so
// they add nothing to normal page loads.

const MARGIN_PT = 28

// The element's own background, else the nearest ancestor's, else white —
// a transparent background would render black in the JPEG pages.
function pageBackground(el) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor
    if (bg && bg !== 'transparent' && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg)) return bg
  }
  const body = getComputedStyle(document.body).backgroundColor
  return body && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(body) ? body : '#ffffff'
}

function slug(s) {
  return String(s || 'brief').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'brief'
}

/**
 * @param {HTMLElement} el     the drawer content element (data-brief-root)
 * @param {string}      title  used for the file name
 */
export async function exportElementPdf(el, title) {
  if (!el) throw new Error('nothing to export')
  // Tag the element so the cloned document can find it, whatever it is.
  el.setAttribute('data-pdf-capture', '1')
  try {
    return await _capture(el, title)
  } finally {
    el.removeAttribute('data-pdf-capture')
  }
}

// Kept for the drawer's existing call site.
export const exportDrawerPdf = exportElementPdf

async function _capture(el, title) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  if (document.fonts?.ready) await document.fonts.ready

  const width = el.clientWidth
  const fullHeight = el.scrollHeight
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: pageBackground(el),
    width,
    height: fullHeight,
    windowWidth: width,
    windowHeight: fullHeight,
    scrollX: 0,
    scrollY: 0,
    ignoreElements: node => node.hasAttribute?.('data-pdf-exclude'),
    onclone: (doc) => {
      // Render the whole drawer, not just the visible scroll window.
      const root = doc.querySelector('[data-pdf-capture]')
      if (!root) return
      root.querySelectorAll('button').forEach(b => { b.style.display = 'none' })
      root.style.height = 'auto'
      root.style.maxHeight = 'none'
      root.style.overflow = 'visible'
      let p = root.parentElement
      while (p && p !== doc.body) {
        p.style.position = 'static'
        p.style.height = 'auto'
        p.style.overflow = 'visible'
        p.style.background = 'transparent'
        p = p.parentElement
      }
    },
  })

  const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const contentW = pageW - 2 * MARGIN_PT
  const contentH = pageH - 2 * MARGIN_PT
  const ptPerPx = contentW / canvas.width
  const sliceHpx = Math.floor(contentH / ptPerPx)

  const slice = document.createElement('canvas')
  slice.width = canvas.width
  const ctx = slice.getContext('2d')
  let y = 0
  let page = 0
  while (y < canvas.height) {
    const h = Math.min(sliceHpx, canvas.height - y)
    slice.height = h
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, slice.width, h)
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
    if (page > 0) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN_PT, MARGIN_PT, contentW, h * ptPerPx)
    y += h
    page += 1
  }
  const total = pdf.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    pdf.setFontSize(8)
    pdf.setTextColor(150, 150, 150)
    pdf.text(`Page ${i} of ${total}`, pageW - MARGIN_PT, pageH - 12, { align: 'right' })
  }
  pdf.save(`${slug(title)}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
