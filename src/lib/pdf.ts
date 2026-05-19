import api from "./api";

/**
 * Fetches a PDF as a Blob using the authenticated API instance
 * and opens it in a new tab. Bypasses browser popup blockers on mobile devices
 * by pre-opening the tab synchronously during user interaction.
 */
export const fetchAndOpenPdf = async (url: string) => {
  const newWindow = typeof window !== "undefined" ? window.open("", "_blank") : null;
  
  if (newWindow) {
    newWindow.document.write(`
      <html>
        <head>
          <title>Loading Document...</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              background-color: #f8fafc;
              color: #0f172a;
            }
            .spinner {
              border: 3px solid #e2e8f0;
              border-top: 3px solid #16a34a;
              border-radius: 50%;
              width: 24px;
              height: 24px;
              animation: spin 1s linear infinite;
              margin-bottom: 12px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <p style="font-size: 14px; font-weight: 500; color: #475569;">Loading document, please wait...</p>
        </body>
      </html>
    `);
    newWindow.document.close();
  }

  try {
    const response = await api.get(url, { responseType: "blob" });
    const blob = new Blob([response.data], { type: "application/pdf" });
    const objectUrl = URL.createObjectURL(blob);
    
    if (newWindow) {
      newWindow.location.href = objectUrl;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
    } else {
      window.location.href = objectUrl;
    }
  } catch (error) {
    console.error("Could not open PDF:", error);
    if (newWindow) {
      newWindow.close();
    }
    throw error;
  }
};

/**
 * Directly opens a Blob as a PDF in a new tab.
 */
export const openPdfBlob = (blob: Blob) => {
  const objectUrl = URL.createObjectURL(blob);
  const newWindow = typeof window !== "undefined" ? window.open(objectUrl, "_blank") : null;
  if (!newWindow) {
    window.location.href = objectUrl;
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
};