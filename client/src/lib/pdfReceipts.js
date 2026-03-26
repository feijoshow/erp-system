let pdfLibModulePromise;

async function getPdfLib() {
  if (!pdfLibModulePromise) {
    pdfLibModulePromise = import('pdf-lib');
  }

  return pdfLibModulePromise;
}

function toMoney(value) {
  return Number(value || 0).toFixed(2);
}

function savePdfBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

function drawTextLines(page, textLines, options = {}) {
  const {
    startX = 48,
    startY = 800,
    lineHeight = 16,
    size = 11,
    font,
  } = options;

  let y = startY;
  textLines.forEach((line) => {
    page.drawText(String(line), { x: startX, y, size, font });
    y -= lineHeight;
  });
}

export async function downloadInvoiceReceipt(invoice) {
  const { PDFDocument, StandardFonts } = await getPdfLib();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('Mini ERP Invoice Receipt', { x: 48, y: 800, size: 18, font: bold });
  drawTextLines(
    page,
    [
      `Invoice ID: ${invoice.id}`,
      `Order ID: ${invoice.order_id}`,
      `Status: ${invoice.status}`,
      `Total: $${toMoney(invoice.amount)}`,
      `Paid: $${toMoney(invoice.paid_amount)}`,
      `Refunded: $${toMoney(invoice.refunded_amount)}`,
      `Net Paid: $${toMoney(invoice.net_paid_amount)}`,
      `Balance: $${toMoney(invoice.balance_amount)}`,
      `Issued: ${new Date(invoice.issued_at).toLocaleString()}`,
    ],
    { startX: 48, startY: 760, lineHeight: 18, size: 11, font: regular }
  );

  const bytes = await pdfDoc.save();
  savePdfBytes(bytes, `invoice-receipt-${invoice.id.slice(0, 8)}.pdf`);
}

export async function downloadReturnReceipt(returnRequest) {
  const { PDFDocument, StandardFonts } = await getPdfLib();
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText('Mini ERP Return Receipt', { x: 48, y: 800, size: 18, font: bold });
  drawTextLines(
    page,
    [
      `Return ID: ${returnRequest.id}`,
      `Order ID: ${returnRequest.order_id}`,
      `Status: ${returnRequest.status}`,
      `Reason: ${returnRequest.reason || '-'}`,
      '',
      'Items',
    ],
    { startX: 48, startY: 760, lineHeight: 18, size: 11, font: regular }
  );

  const itemLines = (returnRequest.order_return_items || []).map(
    (item) => `${item.products?.name || item.product_id} | qty ${item.quantity} | $${toMoney(item.line_total)}`
  );

  drawTextLines(page, itemLines, { startX: 48, startY: 652, lineHeight: 16, size: 10, font: regular });

  const bytes = await pdfDoc.save();
  savePdfBytes(bytes, `return-receipt-${returnRequest.id.slice(0, 8)}.pdf`);
}