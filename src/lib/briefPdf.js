// Export the signal drawer to PDF — an exact visual copy of what the reader
// sees online (same layout, colors, fonts, collapsed/expanded sections).
//
// The drawer element is rendered with html2canvas and paginated onto US
// Letter pages with jsPDF. Elements marked data-pdf-exclude (close button,
// status buttons, refresh/export controls) are left out. Both libraries are
// loaded on demand, so they add nothing to normal page loads.

const MARGIN_PT = 28

function slug(s) {
  return String(s || 'brief').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'brief'
}

/**
 * @param {HTMLElement} el     the drawer content element (data-brief-root)
 * @param {string}      title  used for the file name
 */
export async function exportDrawerPdf(el, title) {
  if (!el) throw new Error('nothing to export')
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  if (document.fonts?.ready) await document.fonts.ready

  const width = el.clientWidth
  const fullHeight = el.scrollHeight
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: getComputedStyle(el).backgroundColor || '#ffffff',
    width,
    height: fullHeight,
    windowWidth: width,
    windowHeight: fullHeight,
    scrollX: 0,
    scrollY: 0,
    ignoreElements: node => node.hasAttribute?.('data-pdf-exclude'),
    onclone: (doc) => {
      // Render the whole drawer, not just the visible scroll window.
      const root = doc.querySelector('[data-brief-root]')
      if (!root) return
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
