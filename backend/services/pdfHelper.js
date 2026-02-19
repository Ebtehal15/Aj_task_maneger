const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

/**
 * Generate a PDF with full task details and stream it to the response.
 * The caller is responsible for passing an authenticated task object.
 */
function streamTaskPdf({ task, updates = [], files = [], req, res }) {
  // Professional margins: top/bottom 50, left/right 60
  const doc = new PDFDocument({ 
    margin: { top: 50, bottom: 50, left: 60, right: 60 }, 
    size: 'A4' 
  });

  // Try to use a Unicode font so Turkish/Arabic characters render correctly.
  // Priority for Render (Linux) - project fonts first, then Windows fonts (local dev only)
  // 1) Project fonts (works on Render/Linux) - MUST HAVE for production
  // 2) Windows system fonts (local development only)
  // 3) Built‑in Helvetica (last resort, may break TR/AR chars)
  const candidateFonts = [
    // Project fonts FIRST (these work on Render/Linux)
    // Arabic-specific font for better Arabic rendering
    path.join(__dirname, '..', 'public', 'fonts', 'NotoSansArabic-Regular.ttf'),
    path.join(__dirname, '..', 'public', 'fonts', 'NotoSans-Regular.ttf'),
    path.join(__dirname, '..', 'public', 'fonts', 'Inter-Regular.ttf'),
    path.join(__dirname, '..', 'public', 'fonts', 'Roboto-Regular.ttf'),
    // Windows fonts (local development only - won't work on Render)
    'C:\\Windows\\Fonts\\segoeui.ttf',
    'C:\\Windows\\Fonts\\segoeuib.ttf',
    'C:\\Windows\\Fonts\\calibri.ttf',
    'C:\\Windows\\Fonts\\calibrib.ttf',
    'C:\\Windows\\Fonts\\tahoma.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
  ];

  let fontSet = false;
  for (const fontPath of candidateFonts) {
    try {
      if (fs.existsSync(fontPath)) {
        doc.font(fontPath);
        fontSet = true;
        break;
      }
    } catch (e) {
      // ignore and try next
    }
  }

  if (!fontSet) {
    // Fallback – might not render TR/AR perfectly but avoids crash
    doc.font('Helvetica');
  }

  const safeId = task.id || 'task';
  // Create a safe filename from task title or use task ID
  const taskTitle = task.title ? task.title.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s]/g, '').trim().substring(0, 30) : '';
  const fileName = taskTitle 
    ? `gorev_${safeId}_${taskTitle.replace(/\s+/g, '_')}.pdf`
    : `gorev_${safeId}_detay.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(fileName)}"`
  );

  doc.pipe(res);

  const t = req.t || ((key) => key);
  const isRTL = (req && (req.dir === 'rtl' || req.lang === 'ar')) ? true : false;

  // Use app translations; if key is missing or same as key, fall back
  const label = (key, fallback) => {
    try {
      const translated = t(key);
      if (!translated || translated === key) {
        return fallback || key;
      }
      return translated;
    } catch (e) {
      return fallback || key;
    }
  };

  // Helper to detect if text contains Arabic characters
  const hasArabic = (text) => {
    if (!text) return false;
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
  };

  // Helper to fix Arabic text order for PDFKit
  // PDFKit doesn't handle RTL properly, so we need to reverse word order for Arabic text
  const fixArabicText = (text) => {
    if (!text || !hasArabic(text)) return text;
    // Split by whitespace and reverse word order
    // This fixes cases like "المهمة تفاصيل" -> "تفاصيل المهمة"
    const words = text.trim().split(/\s+/);
    // Reverse the word order
    return words.reverse().join(' ');
  };

  // Professional color palette
  const colors = {
    primary: '#1E40AF',      // Blue for headers
    secondary: '#3B82F6',    // Lighter blue
    dark: '#111827',         // Dark text
    gray: '#6B7280',         // Gray text
    lightGray: '#E5E7EB',    // Light borders
    accent: '#10B981',       // Green for success/status
    warning: '#F59E0B',      // Orange for pending
    danger: '#EF4444',       // Red for urgent
    background: '#F9FAFB'   // Light background
  };

  // Helper to add logo
  const addLogo = () => {
    const logoPaths = [
      path.join(__dirname, '..', 'public', 'img', 'site_ikon.png'),
      path.join(__dirname, '..', 'public', 'img', 'logo.jpg'),
    ];

    for (const logoPath of logoPaths) {
      try {
        if (fs.existsSync(logoPath)) {
          const logoWidth = 50;
          const logoHeight = 50;
          const logoX = isRTL 
            ? doc.page.width - doc.page.margins.right - logoWidth
            : doc.page.margins.left;
          doc.image(logoPath, logoX, doc.page.margins.top - 10, {
            width: logoWidth,
            height: logoHeight,
            fit: [logoWidth, logoHeight]
          });
          return logoWidth + 10; // Return width + spacing
        }
      } catch (e) {
        // Continue to next logo
      }
    }
    return 0;
  };

  // === Header with Logo ===
  const logoWidth = addLogo();
  let headerStartX, headerAlign, headerWidth;
  
  if (isRTL) {
    headerStartX = doc.page.margins.left;
    headerAlign = 'right';
    headerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - logoWidth - 10;
  } else {
    headerStartX = doc.page.margins.left + logoWidth;
    headerAlign = logoWidth > 0 ? 'left' : 'center';
    headerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - logoWidth;
  }

  const mainTitle = label('taskDetailsTitle', 'Görev Detayları');
  const mainTitleFixed = hasArabic(mainTitle) ? fixArabicText(mainTitle) : mainTitle;
  
  doc
    .fontSize(24)
    .fillColor(colors.primary)
    .text(mainTitleFixed, headerStartX, doc.page.margins.top - 5, {
      align: headerAlign,
      width: headerWidth
    });

  // App name below title
  doc
    .fontSize(10)
    .fillColor(colors.gray)
    .text('AJ İş Takip', headerStartX, doc.page.margins.top + 25, {
      align: headerAlign,
      width: headerWidth
    });

  doc.y = doc.page.margins.top + 50;

  // Decorative line under header
  const headerLineY = doc.y;
  doc
    .moveTo(doc.page.margins.left, headerLineY)
    .lineTo(doc.page.width - doc.page.margins.right, headerLineY)
    .lineWidth(2)
    .strokeColor(colors.primary)
    .stroke();

  doc.moveDown(1.5);

  // Helper to add a section with border
  const addSection = (title, contentCallback) => {
    const sectionStartY = doc.y;
    const sectionMargin = 15;
    const sectionPadding = 12;

    // Section header with background
    doc
      .rect(doc.page.margins.left, sectionStartY, 
            doc.page.width - doc.page.margins.left - doc.page.margins.right, 30)
      .fillColor(colors.background)
      .fill()
      .fillColor(colors.primary);

    const sectionTitleFixed = hasArabic(title) ? fixArabicText(title) : title;
    
    doc
      .fontSize(16)
      .fillColor(colors.primary)
      .text(sectionTitleFixed, doc.page.margins.left + sectionPadding, sectionStartY + 8, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right - (sectionPadding * 2),
        align: isRTL ? 'right' : 'left'
      });

    // Underline for section title
    doc
      .moveTo(doc.page.margins.left + sectionPadding, sectionStartY + 28)
      .lineTo(doc.page.width - doc.page.margins.right - sectionPadding, sectionStartY + 28)
      .lineWidth(1)
      .strokeColor(colors.secondary)
      .stroke();

    doc.y = sectionStartY + 35;

    // Section content
    if (contentCallback) {
      contentCallback();
    }

    // Section border
    const sectionEndY = doc.y + sectionMargin;
    doc
      .rect(doc.page.margins.left, sectionStartY, 
            doc.page.width - doc.page.margins.left - doc.page.margins.right, 
            sectionEndY - sectionStartY)
      .lineWidth(1)
      .strokeColor(colors.lightGray)
      .stroke();

    doc.y = sectionEndY + sectionMargin;
  };

  // Enhanced field with icon
  const addField = (icon, labelText, value, isUrgent = false) => {
    const text = value === null || typeof value === 'undefined' || value === '' ? '-' : String(value);
    const fieldColor = isUrgent ? colors.danger : colors.dark;
    const labelHasArabic = hasArabic(labelText);
    const valueHasArabic = hasArabic(text);
    const useRTL = isRTL || labelHasArabic || valueHasArabic;
    
    const fieldWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - 40;
    const fieldX = doc.page.margins.left + 20;
    const currentY = doc.y;
    
    if (useRTL) {
      // RTL (Arabic): Right-aligned, proper RTL order
      // In RTL, we display: [label] [icon] : [value]
      // But since PDFKit doesn't handle RTL automatically, we align right and write in RTL order
      const iconPart = icon ? ` ${icon}` : '';
      const labelTextFixed = hasArabic(labelText) ? fixArabicText(labelText) : labelText;
      
      // Write label + icon first (right-aligned, on top)
      doc
        .fontSize(11)
        .fillColor(fieldColor)
        .text(`${labelTextFixed}${iconPart}:`, fieldX, currentY, {
          align: 'right',
          width: fieldWidth
        });
      
      // Move down for value
      doc.moveDown(0.2);
      
      // Write value below label (right-aligned)
      const valueTextFixed = hasArabic(text) ? fixArabicText(text) : text;
      doc
        .fontSize(11)
        .fillColor(colors.gray)
        .text(valueTextFixed, fieldX, doc.y, {
          align: 'right',
          width: fieldWidth
        });
      
      doc.moveDown(0.4);
    } else {
      // LTR: icon + label + value
      // Icon (using Unicode symbols)
      if (icon) {
        doc
          .fontSize(12)
          .fillColor(colors.secondary)
          .text(icon, { continued: true });
      }

      // Label
      doc
        .fontSize(11)
        .fillColor(fieldColor)
        .text(` ${labelText}: `, { continued: true });

      // Value
      doc
        .fontSize(11)
        .fillColor(colors.gray)
        .text(text);
    }

    // Underline for each field
    const underlineY = doc.y;
    const lineStartX = doc.page.margins.left + 20;
    const lineEndX = doc.page.width - doc.page.margins.right - 20;
    doc
      .moveTo(lineStartX, underlineY + 2)
      .lineTo(lineEndX, underlineY + 2)
      .lineWidth(0.3)
      .strokeColor(colors.lightGray)
      .stroke();

    doc.moveDown(0.4);
  };

  // Status badge helper
  const getStatusColor = (status) => {
    switch (status) {
      case 'done': return colors.accent;
      case 'in_progress': return colors.warning;
      case 'pending': return colors.secondary;
      default: return colors.gray;
    }
  };

  // === Basic Info Section ===
  addSection(label('basicInfo', 'Genel Bilgiler'), () => {
    addField('', label('taskTitle', 'Görev Başlığı'), task.title, task.acil);
    
    if (task.task_subject) {
      addField('', label('taskSubject', 'İş Konusu'), task.task_subject);
    }
    
    if (task.description) {
      addField('', label('description', 'Açıklama'), task.description);
    }

    // Status with colored badge
    const statusText = label(`status_${task.status}`, task.status);
    const statusColor = getStatusColor(task.status);
    const statusLabel = label('status', 'Durum');
    const statusHasArabic = hasArabic(statusLabel) || hasArabic(statusText);
    const statusUseRTL = isRTL || statusHasArabic;
    
    if (statusUseRTL) {
      const fieldWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - 40;
      const fieldX = doc.page.margins.left + 20;
      const statusY = doc.y;
      
      // Label (right-aligned)
      const statusLabelFixed = hasArabic(statusLabel) ? fixArabicText(statusLabel) : statusLabel;
      doc
        .fontSize(11)
        .fillColor(colors.dark)
        .text(`${statusLabelFixed}:`, fieldX, statusY, {
          align: 'right',
          width: fieldWidth
        });
      
      // Value (right-aligned, below)
      const statusTextFixed = hasArabic(statusText) ? fixArabicText(statusText) : statusText;
      doc
        .fontSize(11)
        .fillColor(statusColor)
        .text(statusTextFixed, fieldX, doc.y, {
          align: 'right',
          width: fieldWidth
        });
      
      doc
        .moveTo(doc.page.margins.left + 20, doc.y + 2)
        .lineTo(doc.page.width - doc.page.margins.right - 20, doc.y + 2)
        .lineWidth(0.3)
        .strokeColor(colors.lightGray)
        .stroke();
      
      doc.moveDown(0.4);
    } else {
      doc
        .fontSize(11)
        .fillColor(colors.dark)
        .text(`${statusLabel}: `, { continued: true })
        .fillColor(statusColor)
        .text(statusText);

      const statusY = doc.y;
      doc
        .moveTo(doc.page.margins.left + 20, statusY + 2)
        .lineTo(doc.page.width - doc.page.margins.right - 20, statusY + 2)
        .lineWidth(0.3)
        .strokeColor(colors.lightGray)
        .stroke();

      doc.moveDown(0.4);
    }
  });

  // === Responsible / Team Section ===
  addSection(label('responsibleInfo', 'Sorumlular'), () => {
    if (task.konu_sorumlusu_username) {
      addField('', label('konuSorumlusu', 'Konu Sorumlusu'), task.konu_sorumlusu_username);
    }

    const teamMembers = [];
    if (task.assigned_username) teamMembers.push(task.assigned_username);
    if (task.sorumlu_2_username) teamMembers.push(task.sorumlu_2_username);
    if (task.sorumlu_3_username) teamMembers.push(task.sorumlu_3_username);
    if (teamMembers.length) {
      addField('', label('team', 'Ekip'), teamMembers.join(', '));
    }

    if (task.departman) {
      addField('', label('departman', 'Departman'), task.departman);
    }

    if (task.bolge || task.il || task.belediye) {
      const locationParts = [];
      if (task.bolge) locationParts.push(task.bolge);
      if (task.il) locationParts.push(task.il);
      if (task.belediye) locationParts.push(task.belediye);
      addField('', label('location', 'Lokasyon'), locationParts.join(' - '));
    }
  });

  // === Dates Section ===
  const formatDate = (value) => {
    if (!value) return '-';
    if (typeof value === 'string') return value.slice(0, 10);
    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch (e) {
      return String(value);
    }
  };

  addSection(label('dateInfo', 'Tarihler'), () => {
    addField('', label('givenDate', 'İş Verilme Tarihi'), formatDate(task.verilen_is_tarihi));
    addField('', label('deadline', 'Tahmini İş Bitiş Tarihi'), formatDate(task.deadline));
    addField('', label('completedAt', 'Bitiş Tarihi'), formatDate(task.completed_at));
  });

  // === Files Section ===
  if (files.length) {
    addSection(label('attachments', 'Ekler'), () => {
      files.forEach((file, index) => {
        const name = file.original_name || file.filename || `file-${index + 1}`;
        doc
          .fontSize(10)
          .fillColor(colors.gray)
          .text(name, doc.page.margins.left + 20, doc.y);
        doc.moveDown(0.3);
      });
    });
  }

  // === Updates Section ===
  if (updates.length) {
    doc.addPage();
    
    // Page header with logo
    const logoWidth2 = addLogo();
    const recentUpdatesTitle = label('recentUpdates', 'Son Güncellemeler');
    const recentUpdatesTitleFixed = hasArabic(recentUpdatesTitle) ? fixArabicText(recentUpdatesTitle) : recentUpdatesTitle;
    const updatesHeaderAlign = isRTL ? 'right' : (logoWidth2 > 0 ? 'left' : 'center');
    const updatesHeaderStartX = isRTL ? doc.page.margins.left : doc.page.margins.left + logoWidth2;
    const updatesHeaderWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - logoWidth2;
    
    doc
      .fontSize(20)
      .fillColor(colors.primary)
      .text(recentUpdatesTitleFixed, 
            updatesHeaderStartX, doc.page.margins.top - 5, {
        align: updatesHeaderAlign,
        width: updatesHeaderWidth
      });

    doc.y = doc.page.margins.top + 40;

    updates.forEach((update, index) => {
      const statusLabel = update.status
        ? label(`status_${update.status}`, update.status)
        : '';
      const dateText = formatDate(update.created_at);
      const statusColor = getStatusColor(update.status);

      // Update card with border
      const cardStartY = doc.y;
      const cardPadding = 12;

      // Temporary card background - will be redrawn with correct height
      doc
        .rect(doc.page.margins.left, cardStartY, 
              doc.page.width - doc.page.margins.left - doc.page.margins.right, 100)
        .fillColor(colors.background)
        .fill();

      // Update header
      doc
        .fontSize(12)
        .fillColor(colors.primary)
        .text(`${index + 1}. ${update.username || ''}`, 
              doc.page.margins.left + cardPadding, cardStartY + 8);

      doc
        .fontSize(10)
        .fillColor(colors.gray)
        .text(dateText, 
              doc.page.margins.left + cardPadding, cardStartY + 22);

      if (statusLabel) {
        const statusLabelFixed = hasArabic(statusLabel) ? fixArabicText(statusLabel) : statusLabel;
        doc
          .fontSize(10)
          .fillColor(statusColor)
          .text(statusLabelFixed, 
                doc.page.margins.left + cardPadding, cardStartY + 35);
      }

      if (update.note) {
        const noteText = String(update.note);
        const noteTextFixed = hasArabic(noteText) ? fixArabicText(noteText) : noteText;
        const noteWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - (cardPadding * 2) - 10;
        doc
          .fontSize(10)
          .fillColor(colors.dark)
          .text(noteTextFixed, 
                doc.page.margins.left + cardPadding + 5, cardStartY + 48, {
            width: noteWidth,
            align: isRTL || hasArabic(noteTextFixed) ? 'right' : 'left'
          });
      }

      // Calculate final card height based on actual content
      const finalCardHeight = Math.max(60, doc.y - cardStartY + 10);

      // Card border
      doc
        .rect(doc.page.margins.left, cardStartY, 
              doc.page.width - doc.page.margins.left - doc.page.margins.right, finalCardHeight)
        .lineWidth(1)
        .strokeColor(colors.lightGray)
        .stroke();

      doc.y = cardStartY + finalCardHeight + 10;
    });
  }

  // Footer - PDFKit pages start from 1, not 0
  const pageRange = doc.bufferedPageRange();
  const pageCount = pageRange.count;
  const startPage = pageRange.start || 0;
  
  for (let i = 0; i < pageCount; i++) {
    const pageNum = startPage + i + 1; // PDFKit uses 1-based indexing
    try {
      doc.switchToPage(pageNum);
      doc
        .fontSize(8)
        .fillColor(colors.gray)
        .text(
          `AJ İş Takip - ${new Date().toLocaleDateString('tr-TR')} - Sayfa ${i + 1}/${pageCount}`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom + 10,
          {
            align: 'center',
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right
          }
        );
    } catch (e) {
      // Skip if page doesn't exist
      console.warn(`Could not add footer to page ${pageNum}:`, e.message);
    }
  }

  doc.end();
}

module.exports = {
  streamTaskPdf,
};
