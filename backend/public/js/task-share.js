document.addEventListener('DOMContentLoaded', function () {
  const buttons = document.querySelectorAll('.task-share-btn');
  console.log('Task share buttons found:', buttons.length);
  
  if (!buttons.length) {
    console.warn('No task-share-btn elements found');
    return;
  }

  buttons.forEach((btn, index) => {
    console.log(`Setting up button ${index + 1}:`, btn);
    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      
      const relativeUrl = btn.getAttribute('data-share-url');
      console.log('Share URL:', relativeUrl);
      
      if (!relativeUrl) {
        console.error('No data-share-url attribute found');
        alert('Paylaşım URL\'si bulunamadı');
        return;
      }

      const origin = window.location.origin;
      const pdfUrl = origin + relativeUrl;
      
      // Show loading state
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
      btn.disabled = true;

      try {
        // Fetch PDF as blob
        console.log('Fetching PDF from:', pdfUrl);
        const response = await fetch(pdfUrl);
        
        if (!response.ok) {
          throw new Error(`PDF yüklenemedi: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        console.log('PDF blob received, size:', blob.size, 'bytes');
        
        // Get filename from Content-Disposition header or generate one
        let filename = 'gorev_detay.pdf';
        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch) {
            filename = filenameMatch[1].replace(/['"]/g, '');
          }
        } else {
          // Generate filename from task ID if available
          const taskIdMatch = relativeUrl.match(/\/tasks\/(\d+)\/pdf/);
          if (taskIdMatch) {
            filename = `gorev_${taskIdMatch[1]}_detay.pdf`;
          }
        }

        // Create File object from blob
        const file = new File([blob], filename, { type: 'application/pdf' });
        console.log('File created:', filename, file.size, 'bytes');

        // Try Web Share API with file (works on mobile devices)
        if (navigator.share) {
          try {
            // Check if file sharing is supported
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              console.log('Using Web Share API with file');
              await navigator.share({
                files: [file],
                title: 'Görev Detay PDF',
                text: 'Görev detayları PDF dosyası'
              });
              console.log('File shared successfully via Web Share API');
              return; // Success, exit early
            } else {
              console.log('Web Share API available but file sharing not supported');
              // Fall through to download
            }
          } catch (shareError) {
            console.log('Web Share API error:', shareError);
            // Fall through to download
          }
        }
        
        // Fallback: Download the file
        console.log('Downloading PDF file');
        const downloadUrl = window.URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = downloadUrl;
        downloadLink.download = filename;
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Clean up URL after a delay
        setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1000);
        
        // Show success message
        alert('PDF dosyası indirildi!\n\nDosya adı: ' + filename + '\n\nİndirilen dosyayı WhatsApp\'tan gönderebilirsiniz.');
      } catch (error) {
        console.error('Error sharing PDF:', error);
        alert('PDF paylaşılırken hata oluştu: ' + error.message);
      } finally {
        // Restore button state
        btn.innerHTML = originalHTML;
        btn.disabled = false;
      }
    });
  });
});


